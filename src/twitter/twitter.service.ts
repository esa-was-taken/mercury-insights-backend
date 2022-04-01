import { Injectable } from '@nestjs/common';
import { TTweet } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import * as dotenv from 'dotenv';
import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';

dotenv.config();

@Injectable()
export class TwitterService {
  client: TwitterApiReadOnly;

  constructor() {
    const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
    this.client = twitterClient.readOnly;
  }
}
