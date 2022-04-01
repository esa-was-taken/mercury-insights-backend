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

const scraperId = 'scraper-profile';

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

/*
   DATABASE 
*/
async function _scrape() {
  // Get a list of 100 marked users whose profiles are the stalest
  const users = await prisma.tUser.findMany({
    where: {
      marked: true,
    },
    orderBy: {
      profileScrapedAt: 'asc',
    },
    include: {
      _count: {
        select: { following: true },
      },
    },
    take: 100,
  });
  const userIds = users.map((x) => x.id);
  console.log(`Scraping user profiles: ${users.map((x) => x.username)}`);

  // Fetch profiles of these 100 marked users
  const request = await client.v2.users(userIds, {
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

  // Update profiles for these 100 marked users in the database
  for (const user of request.data) {
    const twitterMetaData = {
      createdAt: user.created_at,
      description: user.description,
      entities: user.entities ? JSON.stringify(user.entities) : undefined,
      location: user.location,
      pinned_tweet_id: user.pinned_tweet_id,
      profile_image_url: user.profile_image_url,
      protected: user.verified,
      url: user.url,
      verified: user.verified,
    };

    const twitterPublicMetrics = {
      followers_count: user.public_metrics?.followers_count,
      following_count: user.public_metrics?.following_count,
      tweet_count: user.public_metrics?.tweet_count,
      listed_count: user.public_metrics?.listed_count,
    };

    const _user = users.find((x) => x.id === user.id);
    await prisma.tUser.update({
      where: { id: user.id },
      data: {
        profileScrapedAt: new Date(),
        diffFollowingCount: Math.abs(
          twitterPublicMetrics.following_count - _user.lastFollowingCount,
        ),
        twitterMetaData: { update: twitterMetaData },
        twitterPublicMetrics: { update: twitterPublicMetrics },
      },
    });
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
