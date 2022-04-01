import { Injectable } from '@nestjs/common';
import { TTweet } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TweetService {
  constructor(private prisma: PrismaService) {}

  async getTweet(tweetId: string) {
    const tweet = await this.prisma.tTweet.findUnique({
      where: { id: tweetId },
      include: {
        likes: {
          include: { tUser: { select: { username: true, name: true } } },
        },
      },
    });

    return tweet;
  }

  async listMostLikedTweets(afterDate: Date) {
    type TTweetWithLikesCount = {
      likes: number;
      id: string;
      tweetText: string;
      createdAt: Date;
      authorId: string;
      like_count: number;
      quote_count: number;
      reply_count: number;
      retweet_count: number;
    };

    const tweets = await this.prisma.$queryRaw<TTweetWithLikesCount[]>`
      SELECT likes, tweet."id", tweet."tweetText", tweet."createdAt", tweet."authorId", pm.like_count, pm.quote_count, pm.reply_count, pm.retweet_count FROM
      (
        SELECT count(l."tTweetId") likes, tweet.*
        FROM PUBLIC."TTweet" tweet
        LEFT JOIN PUBLIC."TLike" l on tweet.id = l."tTweetId"
        WHERE tweet."createdAt" >= ${afterDate}
        GROUP BY tweet.id	
      ) tweet
      LEFT JOIN PUBLIC."TTweetPublicMetrics" pm on tweet.id = pm."tTweetId"
      ORDER BY likes DESC
      LIMIT 1000;`;
    return tweets;
  }
}
