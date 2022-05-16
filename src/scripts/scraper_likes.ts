import * as dotenv from 'dotenv';
import { PrismaClient, ConnectionStatus, TUser } from '@prisma/client';
import { mainModule } from 'process';
import {
  TwitterApi,
  TwitterRateLimit,
  ApiResponseError,
  UserV2,
  ApiRequestError,
  TweetV2,
} from 'twitter-api-v2';

dotenv.config();
const prisma = new PrismaClient();

const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
const client = twitterClient.readOnly;

const scraperId = 'scraper-likes';

/*
  TWITTER
*/

class CustomRatelimitError extends Error {
  rateLimit: TwitterRateLimit;

  constructor(_rateLimit: TwitterRateLimit) {
    super();
    this.rateLimit = _rateLimit;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoRetryOnRateLimitError<T>(callback: () => T | Promise<T>) {
  while (true) {
    try {
      return await callback();
    } catch (error) {
      if (
        (error instanceof ApiResponseError &&
          error.rateLimitError &&
          error.rateLimit) ||
        (error instanceof CustomRatelimitError && error.rateLimit)
      ) {
        const resetTimeout = error.rateLimit.reset * 1000; // convert to ms time instead of seconds time
        const timeToWait = resetTimeout - Date.now();
        console.log(
          `Ratelimited: sleeping for ${timeToWait / 1000.0 / 60.0} minutes`,
        );
        await sleep(timeToWait);
        continue;
      }
      throw error;
    }
  }
}

async function _fetchTwitterFollowingByUserId(userId: string) {
  const request = await client.v2.userLikedTweets(userId, {
    max_results: 100,
    'tweet.fields': [
      'attachments',
      'author_id',
      'context_annotations',
      'conversation_id',
      'created_at',
      'entities',
      'geo',
      'id',
      'in_reply_to_user_id',
      'lang',
      'public_metrics',
      'possibly_sensitive',
      'referenced_tweets',
      'reply_settings',
      'source',
      'text',
      'withheld',
    ],
  });

  const likes = request.tweets;
  await prisma.scraperData.update({
    where: { id: scraperId },
    data: {
      ratelimit_limit: request.rateLimit.limit,
      ratelimit_remaining: request.rateLimit.remaining,
      ratelimit_reset: request.rateLimit.reset,
    },
  });
  return likes;
}

async function fetchTwitterLikesByUserId(userId: string) {
  return await _fetchTwitterFollowingByUserId(userId);
  // return await autoRetryOnRateLimitError(() =>
  //   _fetchTwitterFollowingByUserId(userId),
  // );
}

/*
   DATABASE 
*/

async function fetchLastScrapedMarkedUser() {
  return await prisma.tUser.findFirst({
    where: {
      marked: true,
    },
    orderBy: {
      likesScrapedAt: 'asc',
    },
  });
}

async function fetchDbLikesOfUserId(userId: string) {
  const likes = await prisma.tLike.findMany({
    where: {
      tUserId: userId,
    },
    orderBy: {
      recordCreatedAt: 'desc',
    },
    take: 1000,
    select: {
      tTweetId: true,
    },
  });

  return likes.map((x) => x.tTweetId);
}

function computeChanges(__old: string[], __new: string[]) {
  const _old = new Set(__old);
  const _new = new Set(__new);

  return {
    added: new Set([..._new].filter((x) => !_old.has(x))),
  };
}

async function upsertTweet(newTweet: TweetV2) {
  const twitterPublicMetrics = {
    retweet_count: newTweet.public_metrics?.retweet_count,
    reply_count: newTweet.public_metrics?.reply_count,
    like_count: newTweet.public_metrics?.like_count,
    quote_count: newTweet.public_metrics?.quote_count,
  };

  const tweetCreate = {
    id: newTweet.id,
    tweetText: newTweet.text,
    createdAt: newTweet.created_at,
    authorId: newTweet.author_id,
    conversationId: newTweet.conversation_id,

    referencedTweets: newTweet.referenced_tweets
      ? JSON.stringify(newTweet.referenced_tweets)
      : undefined,
    attachments: newTweet.attachments
      ? JSON.stringify(newTweet.attachments)
      : undefined,
    geo: newTweet.geo ? JSON.stringify(newTweet.geo) : undefined,
    context_annotations: newTweet.context_annotations
      ? JSON.stringify(newTweet.context_annotations)
      : undefined,
    entities: newTweet.entities ? JSON.stringify(newTweet.entities) : undefined,
    withheld: newTweet.withheld ? JSON.stringify(newTweet.withheld) : undefined,
    possibly_sensitive: newTweet.possibly_sensitive,
    lang: newTweet.lang,
    reply_settings: newTweet.reply_settings,
    source: newTweet.source,

    twitterPublicMetrics: {
      create: twitterPublicMetrics,
    },
  };

  const tweetUpsert = {
    ...tweetCreate,
    twitterPublicMetrics: {
      upsert: {
        create: twitterPublicMetrics,
        update: twitterPublicMetrics,
      },
    },
  };

  const upsertedTweet = await prisma.tTweet.upsert({
    where: { id: newTweet.id },
    create: tweetCreate,
    update: tweetUpsert,
  });

  return upsertedTweet;
}

async function _saveLikesChanges(
  user: TUser,
  likedTweets: TweetV2[],
  likedTweetId: string,
) {
  const likedTweetInfo = likedTweets.find((x) => x.id === likedTweetId);
  const likedTweet = likedTweetInfo
    ? await upsertTweet(likedTweetInfo)
    : await prisma.tTweet.findUnique({ where: { id: likedTweetId } }); // If the info is undefined, this user is being removed

  // Check if the like already exists:
  const like = await prisma.tLike.findMany({
    where: { tUserId: user.id, tTweetId: likedTweet.id },
  });
  if (like.length > 0) {
    console.log(
      `Record already exists. User ID: ${user.id}, Tweet ID: ${likedTweet.id}\n${like}`,
    );
    return like[0];
  }
  return await prisma.tLike.create({
    data: {
      tUser: { connect: { id: user.id } },
      tTweet: { connect: { id: likedTweet.id } },
    },
  });
}

async function saveLikesChanges(
  user: TUser,
  likedTweets: TweetV2[],
  changes: {
    added: Set<string>;
  },
) {
  for (const likedTweetId of changes.added) {
    await _saveLikesChanges(user, likedTweets, likedTweetId);
  }
}

async function updateMarkedUser(user: TUser) {
  console.log('2', user.id);
  const updatedUser = await prisma.tUser.update({
    where: {
      id: user.id,
    },
    data: {
      likesScrapedAt: new Date(),
    },
  });
  return updatedUser;
}

async function _scrape() {
  // Get the marked user that was last scraped
  const markedUser = await fetchLastScrapedMarkedUser();
  console.log('1', markedUser.id);
  console.log('Scraping:', markedUser);
  if (
    Date.now() - markedUser.likesScrapedAt.valueOf() >
    1000.0 * 60.0 * 60.0 * 24.0 // 1 day
  ) {
    // Fetch the old followed from database
    const oldLikes = await fetchDbLikesOfUserId(markedUser.id);

    // Fetch the current followed from twitter API
    const newLikes = await fetchTwitterLikesByUserId(markedUser.id);
    console.log('Length: ', newLikes.length);

    // Compute the changes in following
    const changes = computeChanges(
      oldLikes,
      newLikes.map((e) => e.id),
    );
    console.log(`Changes in following:\n\tadded(${changes.added.size})`);

    // Save changes to database
    await saveLikesChanges(markedUser, newLikes, changes);

    // Set last scraped of user to now
    await updateMarkedUser(markedUser);
  } else {
    console.log('Nothing to update...');
  }
}

async function scrape() {
  console.log('Starting scrape...', new Date().toISOString());
  await _scrape();
  console.log('Finished scrape...', new Date().toISOString());
}

async function main() {
  let scraperData = await prisma.scraperData.findUnique({
    where: { id: scraperId },
  });
  if (!scraperData) {
    console.log('Creating new scraper...');
    scraperData = await prisma.scraperData.create({
      data: {
        id: scraperId,
        ratelimit_limit: 0,
        ratelimit_remaining: 0,
        ratelimit_reset: 0,
      },
    });
  }
  console.log(`Scraper data:`, scraperData);

  const scraperStale =
    Date.now() - scraperData.updatedAt.valueOf() > 1000.0 * 60.0 * 30.0; // 30 minutes
  const ratelimitHasReset =
    Date.now() - scraperData.ratelimit_reset * 1000.0 > 0;
  console.log(`Stale: ${scraperStale}, Ratelimit reset: ${ratelimitHasReset}`);
  if (
    scraperData.ratelimit_remaining > 1 ||
    ratelimitHasReset ||
    scraperStale
  ) {
    try {
      await scrape();
      await prisma.scraperData.update({
        where: { id: scraperId },
        data: { error: null },
      });
    } catch (error) {
      console.log('ERROR:', error);
      if (
        (error instanceof ApiResponseError &&
          error.rateLimitError &&
          error.rateLimit) ||
        (error instanceof CustomRatelimitError && error.rateLimit)
      ) {
        await prisma.scraperData.update({
          where: { id: scraperId },
          data: {
            error: 'Ratelimited',
            ratelimit_limit: error.rateLimit.limit,
            ratelimit_remaining: error.rateLimit.remaining,
            ratelimit_reset: error.rateLimit.reset,
          },
        });
      } else if (
        error instanceof ApiResponseError ||
        error instanceof ApiRequestError
      ) {
        await prisma.scraperData.update({
          where: { id: scraperId },
          data: { error: error.message },
        });
      } else {
        throw error;
      }
    }
  }
}

async function tempMain() {
  await main();
  const timer = setInterval(() => main(), 1000.0 * 60.0);
}

tempMain()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
