import * as dotenv from 'dotenv';
import { PrismaClient, ConnectionStatus, TUser, Prisma } from '@prisma/client';
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  while (true) {
    const tUsers = await prisma.tUser.findMany({
      where: {
        OR: [{ accountExists: null }, { accountExists: true }],
        twitterMetaData: { is: null },
        twitterPublicMetrics: { is: null },
      },
      take: 100,
    });

    if (!tUsers) {
      return;
    }

    const userNames = tUsers.map((x) => x.username);
    console.log('Scraping: ', userNames);
    const users = await client.v2.usersByUsernames(userNames, {
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

    const userExists = [];
    for (const user of users.data) {
      userExists.push(user.username);

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
      try {
        await prisma.tUser.update({
          where: { id: user.id },
          data: {
            accountCreatedAt: user.created_at,
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
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === 'P2025') {
            console.log('Record to update not found.', user);
            // Something somewhere has gone wrong and the user id is malformed. Delete it and let the scraper fix it
            await prisma.tUser.deleteMany({
              where: { username: user.username },
            });
            // await prisma.tUser.updateMany({
            //   where: { username: user.username },
            //   data: {
            //     accountCreatedAt: user.created_at,
            //     twitterMetaData: {
            //       upsert: {
            //         create: twitterMetaData,
            //         update: twitterMetaData,
            //       },
            //     },
            //     twitterPublicMetrics: {
            //       upsert: {
            //         create: twitterPublicMetrics,
            //         update: twitterPublicMetrics,
            //       },
            //     },
            //   },
            // });
            continue;
          }
        }
        throw e;
      }
    }

    const userNotExists = userNames.filter((x) => !userExists.includes(x));
    for (const userName of userNotExists) {
      await prisma.tUser.updateMany({
        where: { username: userName },
        data: { accountExists: false },
      });
    }
    await sleep(5000);
  }
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
