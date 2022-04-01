import * as dotenv from 'dotenv';
import {
  PrismaClient,
  ConnectionStatus,
  TUser,
  TUserPublicMetrics,
} from '@prisma/client';
import { mainModule } from 'process';
import {
  TwitterApi,
  TwitterRateLimit,
  ApiResponseError,
  UserV2,
  ApiRequestError,
} from 'twitter-api-v2';

dotenv.config();
const prisma = new PrismaClient();

const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
const client = twitterClient.readOnly;

const scraperId = 'scraper-following';
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

async function _fetchTwitterFollowingByUserId(
  userId: string,
  isFullRefresh: boolean,
) {
  const { request, followers } = isFullRefresh
    ? await _fetchFull()
    : await _fetchPartial();

  console.log('Ratelimit status:', request.rateLimit);
  if (request.rateLimit.remaining === 0) {
    throw new CustomRatelimitError(request.rateLimit);
  }

  await prisma.scraperData.update({
    where: { id: scraperId },
    data: {
      ratelimit_limit: request.rateLimit.limit,
      ratelimit_remaining: request.rateLimit.remaining,
      ratelimit_reset: request.rateLimit.reset,
    },
  });

  return followers;

  async function _fetchFull() {
    const request = await client.v2.following(userId, {
      asPaginator: true,
      max_results: 1000,
      'user.fields': [
        'created_at',
        'description',
        'entities',
        'id',
        'location',
        'name',
        'pinned_tweet_id',
        'profile_image_url',
        'protected',
        'public_metrics',
        'url',
        'username',
        'verified',
        'withheld',
      ],
      expansions: 'pinned_tweet_id',
    });

    const followers: UserV2[] = [];
    for await (const follower of request) {
      followers.push(follower);
    }
    return { request, followers };
  }

  async function _fetchPartial() {
    const request = await client.v2.following(userId, {
      asPaginator: true,
      max_results: 1000,
      'user.fields': [
        'created_at',
        'description',
        'entities',
        'id',
        'location',
        'name',
        'pinned_tweet_id',
        'profile_image_url',
        'protected',
        'public_metrics',
        'url',
        'username',
        'verified',
        'withheld',
      ],
      expansions: 'pinned_tweet_id',
    });

    const followers = request.users;
    return { request, followers };
  }
}

async function fetchTwitterFollowingByUserId(
  userId: string,
  isFullRefresh: boolean,
) {
  return await _fetchTwitterFollowingByUserId(userId, isFullRefresh);
}

async function fetchTwitterUserByUsername(userName: string) {
  const user = await autoRetryOnRateLimitError(
    async () => await client.v2.userByUsername(userName),
  );

  return user.data ? user.data : undefined;
}

/*
   DATABASE 
*/

async function fetchStalestMarkedUser(isFullRefresh: boolean) {
  return await prisma.tUser.findFirst({
    where: {
      marked: true,
    },
    orderBy: [
      { diffFollowingCount: 'desc' },
      isFullRefresh
        ? {
            fullFollowingScrapedAt: 'asc',
          }
        : {
            partialFollowingScrapedAt: 'asc',
          },
    ],
    include: {
      twitterPublicMetrics: true,
      _count: {
        select: { following: true },
      },
    },
  });
}

async function fetchDbFollowingOfUserId(userId: string) {
  const following = await prisma.tConnection.findMany({
    where: {
      fromId: userId,
    },
    distinct: ['fromId', 'toId'],
    orderBy: {
      version: 'desc',
    },
    select: {
      toId: true,
      status: true,
    },
  });

  return following
    .filter((x) => x.status === ConnectionStatus.CONNECTED)
    .map((x) => x.toId);
}

function computeChanges(__old: string[], __new: string[]) {
  const _old = new Set(__old);
  const _new = new Set(__new);

  return {
    added: new Set([..._new].filter((x) => !_old.has(x))),
    removed: new Set([..._old].filter((x) => !_new.has(x))),
  };
}
async function upsertUser(newUser: UserV2) {
  const twitterMetaData = {
    createdAt: newUser.created_at,
    description: newUser.description,
    entities: newUser.entities ? JSON.stringify(newUser.entities) : undefined,
    location: newUser.location,
    pinned_tweet_id: newUser.pinned_tweet_id,
    profile_image_url: newUser.profile_image_url,
    protected: newUser.verified,
    url: newUser.url,
    verified: newUser.verified,
  };

  const twitterPublicMetrics = {
    followers_count: newUser.public_metrics?.followers_count,
    following_count: newUser.public_metrics?.following_count,
    tweet_count: newUser.public_metrics?.tweet_count,
    listed_count: newUser.public_metrics?.listed_count,
  };

  const userCreate = {
    id: newUser.id,
    name: newUser.name,
    username: newUser.username,
    accountCreatedAt: newUser.created_at,
    marked: false,
    twitterMetaData: {
      create: twitterMetaData,
    },
    twitterPublicMetrics: {
      create: twitterPublicMetrics,
    },
  };

  const userUpsert = {
    id: newUser.id,
    name: newUser.name,
    username: newUser.username,
    accountCreatedAt: newUser.created_at,
    twitterMetaData: {
      upsert: {
        create: twitterMetaData,
        update: twitterMetaData,
      },
    },
    twitterPublicMetrics: {
      upsert: {
        create: twitterPublicMetrics,
        update: twitterPublicMetrics,
      },
    },
  };

  const upsertedUser = await prisma.tUser.upsert({
    where: { id: newUser.id },
    create: userCreate,
    update: userUpsert,
  });

  return upsertedUser;
}

async function _savefollowedChanges(
  user: TUser,
  followedUsers: UserV2[],
  followedUserId: string,
  is_removed = false,
) {
  const followedUserInfo = followedUsers.find((x) => x.id === followedUserId);
  const followedUser = followedUserInfo
    ? await upsertUser(followedUserInfo)
    : await prisma.tUser.findUnique({ where: { id: followedUserId } }); // If the info is undefined, this user is being removed

  const previousConnection = await prisma.tConnection.findFirst({
    where: { fromId: user.id, toId: followedUser.id },
    orderBy: { version: 'desc' },
  });

  const version = previousConnection ? previousConnection.version + 1 : 0;
  const status = is_removed
    ? ConnectionStatus.DISCONNECTED
    : ConnectionStatus.CONNECTED;
  const connection = await prisma.tConnection.create({
    data: {
      from: { connect: { id: user.id } },
      to: { connect: { id: followedUser.id } },
      version: version,
      status: status,
    },
  });

  return connection;
}

async function savefollowedChanges(
  user: TUser,
  followedUsers: UserV2[],
  changes: {
    added: Set<string>;
    removed: Set<string>;
  },
  isFullRefresh: boolean,
) {
  for (const followedUserId of changes.added) {
    await _savefollowedChanges(user, followedUsers, followedUserId, false);
  }

  if (isFullRefresh) {
    for (const followedUserId of changes.removed) {
      await _savefollowedChanges(user, followedUsers, followedUserId, true);
    }
  }
}

async function createMarkedUserFromUsername(userName: string) {
  const existingUser = await prisma.tUser.findFirst({
    where: { username: { equals: userName, mode: 'insensitive' } },
  });
  if (existingUser) {
    if (!existingUser.marked) {
      await prisma.tUser.update({
        where: { id: existingUser.id },
        data: { marked: true },
      });
    }
    return existingUser;
  }

  const user = await fetchTwitterUserByUsername(userName);
  if (!user) {
    console.log('Could not find Twitter account:', userName);
    return;
  }

  console.log('Created new user:', user.username);
  return await prisma.tUser.create({
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      accountCreatedAt: user.created_at,
      marked: true,
    },
  });
}

async function updateMarkedUser(
  user: TUser & {
    twitterPublicMetrics: TUserPublicMetrics;
    _count: {
      following: number;
    };
  },
  isFullRefresh: boolean,
) {
  const updatedUser = await prisma.tUser.update({
    where: {
      id: user.id,
    },
    data: {
      ...(isFullRefresh
        ? {
            fullFollowingScrapedAt: new Date(),
          }
        : {
            partialFollowingScrapedAt: new Date(),
          }),
      lastFollowingCount: user.twitterPublicMetrics.following_count,
      diffFollowingCount: 0,
    },
  });
  return updatedUser;
}

async function _scrape() {
  // Between 00:00 and 06:00 do full refreshes (adds and removes)
  // Between 06:00 and 00:00 do partial refreshes (adds only)
  const currentHour = new Date().getHours();
  const isFullRefresh = currentHour >= 0 && currentHour <= 6.0;

  const markedUser = await fetchStalestMarkedUser(isFullRefresh);
  console.log('Scraping:', markedUser);

  // Fetch the old followed from database
  const oldfollowed = await fetchDbFollowingOfUserId(markedUser.id);

  // Fetch the current followed from twitter API
  const newfollowed = await fetchTwitterFollowingByUserId(
    markedUser.id,
    isFullRefresh,
  );

  // Compute the changes in following
  const changes = computeChanges(
    oldfollowed,
    newfollowed.map((e) => e.id),
  );
  console.log(
    `Changes in following:\n\tadded(${changes.added.size})${
      isFullRefresh ? `\n\tremoved(${changes.removed.size}` : ``
    })`,
  );

  // Save changes to database
  await savefollowedChanges(markedUser, newfollowed, changes, isFullRefresh);

  // Set last scraped of user to now
  await updateMarkedUser(markedUser, isFullRefresh);
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
    scraperData.ratelimit_remaining > 0 ||
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
