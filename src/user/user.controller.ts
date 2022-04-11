import {
  Body,
  CacheInterceptor,
  CacheTTL,
  CACHE_MANAGER,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Inject,
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
  UpdateWeightUserDto,
} from './dto';
import { UserService } from './user.service';

import { Cache } from 'cache-manager';

@Controller('user')
export class UserController {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private userService: UserService,
  ) {}

  @Get('/popular')
  async listMostFollowedUsers(): Promise<UserWithFollowers[]> {
    let value = await this.cacheManager.get<UserWithFollowers[]>('popular');
    if (value) {
      return value;
    }
    value = await this.userService.mostFollowedUsers();
    this.cacheManager.set('popular', value, { ttl: 300 });
    return value;
  }

  @Get('/trending/:interval')
  async listMostTrendingUsers(@Param() params): Promise<UserFollowersDiff[]> {
    let value = await this.cacheManager.get<UserFollowersDiff[]>(
      `trending-${params.interval}`,
    );
    if (value) {
      return value;
    }
    value = await this.userService.mostTrendingUsers(params.interval);
    this.cacheManager.set(`trending-${params.interval}`, value, { ttl: 300 });
    return value;
  }

  @Get('/marked')
  async listMarkedUsers() {
    return await this.userService.listMarkedUsers();
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

  @Post('/weight')
  async updateMarkedUserWeight(@Body() updateDto: UpdateWeightUserDto) {
    return await this.userService.updateMarkedUserWeight(
      updateDto.username,
      updateDto.weight,
    );
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

  @Get(':id')
  async getUser(@Param() params): Promise<User> {
    return await this.userService.getUser(params.id);
  }
}
