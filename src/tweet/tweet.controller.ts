import {
  CacheInterceptor,
  Controller,
  Get,
  Query,
  Param,
  UseInterceptors,
} from '@nestjs/common';
import { BeforeDateDto } from './dto';
import { TweetService } from './tweet.service';

@Controller('tweet')
export class TweetController {
  constructor(private tweetService: TweetService) {}

  @Get('/trending')
  async listMostLikedTweets(@Query() query: BeforeDateDto) {
    return await this.tweetService.listMostLikedTweets(query.before);
  }

  @Get(':id')
  async getTweet(@Param() params) {
    return await this.tweetService.getTweet(params.id);
  }
}
