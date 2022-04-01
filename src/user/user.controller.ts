import {
  Body,
  CacheInterceptor,
  CacheTTL,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IsDate } from 'class-validator';
import {
  User,
  UserFollowersDiff,
  UserWithFollowers,
} from 'src/interfaces/user.interface';
import {
  IntervalDto,
  ListMostTrendingUsersDto,
  PaginateDto,
  UpsertUserDto,
} from './dto';
import { UserService } from './user.service';

@UseInterceptors(CacheInterceptor)
@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @CacheTTL(300)
  @Get('/popular')
  async listMostFollowedUsers(): Promise<UserWithFollowers[]> {
    return await this.userService.mostFollowedUsers();
  }

  @CacheTTL(300)
  @Get('/trending')
  async listMostTrendingUsers(
    @Query() query: IntervalDto,
  ): Promise<UserFollowersDiff[]> {
    return await this.userService.mostTrendingUsers(query.start, query.end);
  }
  @Get(':id')
  async getUser(@Param() params): Promise<User> {
    return await this.userService.getUser(params.id);
  }

  @Get('/by/username/:userName')
  async getUserByUserName(@Param() params): Promise<User> {
    return await this.userService.getUserByUserName(params.userName);
  }

  @Post('/by/username/:userName')
  async upsertUserByUsername(@Body() upsertUserDto: UpsertUserDto) {
    return await this.userService.upsertUser(
      upsertUserDto.username,
      upsertUserDto.marked,
    );
  }

  @Get('/marked')
  async listMarkedUsers() {
    return await this.userService.listMarkedUsers();
  }

  @Get(':id/followers')
  async listFollowersOfUser(
    @Param() params,
    @Query() query: PaginateDto,
  ): Promise<User[]> {
    return await this.userService.findFollowersOf(
      params.id,
      query.limit,
      query.offset,
    );
  }

  @Get(':id/following')
  async listFollowingOfUser(
    @Param() params,
    @Query() query: PaginateDto,
  ): Promise<User[]> {
    return await this.userService.findFollowingOf(
      params.id,
      query.limit,
      query.offset,
    );
  }
}
