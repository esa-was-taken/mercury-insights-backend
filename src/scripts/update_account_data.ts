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
    // Fetch 100 accounts with no accountCreatedAt value
    const tUsers = await prisma.tUser.findMany({
      where: { accountCreatedAt: null, accountExists: null },
      take: 100,
    });

    if (!tUsers) {
      return;
    }

    const userNames = tUsers.map((x) => x.username);
    console.log('Scraping: ', userNames);
    const users = await client.v2.usersByUsernames(userNames, {
      'user.fields': 'created_at',
    });

    const userExists = [];
    for (const user of users.data) {
      userExists.push(user.username);
      try {
        await prisma.tUser.update({
          where: { id: user.id },
          data: { accountCreatedAt: user.created_at },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === 'P2025') {
            console.log('Record to update not found.', user);
            await prisma.tUser.updateMany({
              where: { username: user.username },
              data: { accountCreatedAt: user.created_at },
            });
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
