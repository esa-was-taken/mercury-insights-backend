import { GridFilterModel, GridSortModel } from '@mui/x-data-grid-pro';
import { GridFilteringMethod } from '@mui/x-data-grid/internals';
import { Injectable } from '@nestjs/common';
import {
  TUser,
  Prisma,
  TUserMetadata,
  TUserPublicMetrics,
} from '@prisma/client';
import { interval, ObjectUnsubscribedError } from 'rxjs';
import {
  User,
  UserWithFollowers,
  UserFollowersDiff,
  UserMetadata,
  UserPublicMetrics,
} from 'src/interfaces/user.interface';
import { PrismaService } from 'src/prisma.service';
import { GridSortItemDto } from './dto';
import { TwitterService } from '../twitter/twitter.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService, private twitter: TwitterService) {}

  async getUser(userId: string): Promise<User> {
    const user = await this.prisma.tUser.findUnique({
      where: { id: userId },
      include: { twitterMetaData: true, twitterPublicMetrics: true },
    });
    return {
      ...user,
      metadata: user.twitterMetaData ?? ({} as UserMetadata),
      public_metrics: user.twitterPublicMetrics ?? ({} as UserPublicMetrics),
    } as User;
  }

  async upsertUser(username: string, marked: boolean) {
    const request = await this.twitter.client.v2.userByUsername(username);
    if (!request.data) {
      throw new Error(`User does not exist with username ${username}`);
    }

    const user = request.data;
    await this.prisma.tUser.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        username: user.username,
        name: user.name,
        marked: marked,
      },
      update: {
        marked: marked,
      },
    });
  }

  async updateMarkedUserWeight(username: string, weight: number) {
    return await this.prisma.tUser.updateMany({
      where: { username: username },
      data: {
        markedWeight: weight,
      },
    });
  }

  async listMarkedUsers() {
    const markedUsers = await this.prisma.tUser.findMany({
      where: { marked: true },
    });

    return markedUsers;
  }

  async getUserByUserName(userName: string): Promise<User> {
    const user = await this.prisma.tUser.findFirst({
      where: { username: userName },
      include: { twitterMetaData: true, twitterPublicMetrics: true },
    });

    if (user === null) {
      throw new Error('Could not find user');
    }
    return {
      ...user,
      metadata: user.twitterMetaData ?? ({} as UserMetadata),
      public_metrics: user.twitterPublicMetrics ?? ({} as UserPublicMetrics),
    } as User;
  }

  async mostFollowedUsers(): Promise<UserWithFollowers[]> {
    type TUserWithFollowers = TUser & {
      marked_followers_ratio: number;
      marked_followers: number;
      weighted_marked_followers: number;
      metadata: TUserMetadata;
      public_metrics: TUserPublicMetrics;
    };

    const popular = await this.prisma.$queryRaw<TUserWithFollowers[]>` 
      SELECT U.MARKED_FOLLOWERS / NULLIF(PM.followers_count, 0.0) * 100.0 as marked_followers_ratio, U.*, row_to_json(MD.*) as metadata, row_to_json(PM.*) as public_metrics
      FROM
        (SELECT 
        COUNT(CONN."toId") AS MARKED_FOLLOWERS,
        SUM(markedUser."markedWeight") AS WEIGHTED_MARKED_FOLLOWERS,
            U.*
          FROM PUBLIC."TUser" U
          LEFT JOIN
            (SELECT *
              FROM
                (SELECT DISTINCT ON (_INNER."fromId",
                                                            _INNER."toId") _INNER."fromId",
                    _INNER."toId",
                    _INNER."status",
                    _INNER."version",
                    _INNER."createdAt"
                  FROM PUBLIC."TConnection" _INNER
                  ORDER BY _INNER."fromId",
                    _INNER."toId",
                    _INNER."version" DESC) CONN
              WHERE CONN."status" = 'CONNECTED') CONN ON U.ID = CONN."toId"
      LEFT JOIN ( SELECT "id" as markedId, "markedWeight" FROM PUBLIC."TUser") markedUser ON CONN."fromId" = markedUser.markedId  
          GROUP BY U.ID) U
      LEFT JOIN PUBLIC."TUserMetadata" AS MD ON U.ID = MD."tUserId"
      LEFT JOIN PUBLIC."TUserPublicMetrics" AS PM ON U.ID = PM."tUserId";
    `;
    return popular.map((x) => {
      return {
        ...x,
        metadata: x.metadata ?? ({} as UserMetadata),
        public_metrics: x.public_metrics ?? ({} as UserPublicMetrics),
      } as UserWithFollowers;
    });
  }

  async mostTrendingUsers(interval: number): Promise<UserFollowersDiff[]> {
    if (interval <= 0) {
      throw new Error('Interval has to be positive non-zero number');
    }

    const intervalStart = new Date();
    intervalStart.setHours(intervalStart.getHours() - interval);
    const intervalEnd = new Date();

    type CustomTUserFollowingDiff = TUser & {
      marked_followers_ratio: number;
      marked_followers: number;
      weighted_marked_followers: number;
      difference: number;
      weighted_difference: number;
      metadata: TUserMetadata;
      public_metrics: TUserPublicMetrics;
    };

    const trending = await this.prisma.$queryRaw<CustomTUserFollowingDiff[]>`
  SELECT T1.MARKED_FOLLOWERS / NULLIF(PM.followers_count, 0.0) * 100.0 as marked_followers_ratio, T1.*,
  row_to_json(MD.*) as metadata, row_to_json(PM.*) as public_metrics,
	COALESCE(T1.MARKED_FOLLOWERS,
		0) - COALESCE(T2.MARKED_FOLLOWERS,

								0) AS difference,
  COALESCE(T1.WEIGHTED_MARKED_FOLLOWERS,
    0) - COALESCE(T2.WEIGHTED_MARKED_FOLLOWERS,

                0) AS weighted_difference
FROM
	(SELECT ID,
			NAME,
			USERNAME,
			COUNT(CONN."toId") AS MARKED_FOLLOWERS,
      SUM(markedUser."markedWeight") AS WEIGHTED_MARKED_FOLLOWERS
		FROM PUBLIC."TUser" U
		LEFT JOIN
			(SELECT *
				FROM
					(SELECT DISTINCT ON (_INNER."fromId", _INNER."toId") 
					 		_INNER."fromId",
							_INNER."toId",
							_INNER."status",
							_INNER."version",
							_INNER."createdAt"
						FROM PUBLIC."TConnection" _INNER
						WHERE _INNER."createdAt" <= ${intervalEnd}
						ORDER BY _INNER."fromId",
							_INNER."toId",
							_INNER."version" DESC) CONN
				WHERE CONN."status" = 'CONNECTED') CONN ON U.ID = CONN."toId"
        LEFT JOIN ( SELECT "id" as markedId, "markedWeight" FROM PUBLIC."TUser") markedUser ON CONN."fromId" = markedUser.markedId  
		GROUP BY U.ID) AS T1
FULL JOIN
	(SELECT ID,
			NAME,
			USERNAME,
			COUNT(CONN."toId") AS MARKED_FOLLOWERS,
      SUM(markedUser."markedWeight") AS WEIGHTED_MARKED_FOLLOWERS
		FROM PUBLIC."TUser" U
		LEFT JOIN
			(SELECT *
				FROM
					(SELECT DISTINCT ON (_INNER."fromId", _INNER."toId") 
					 		_INNER."fromId",
							_INNER."toId",
							_INNER."status",
							_INNER."version",
							_INNER."createdAt"
						FROM PUBLIC."TConnection" _INNER
						WHERE _INNER."createdAt" <= ${intervalStart}
						ORDER BY _INNER."fromId",
							_INNER."toId",
							_INNER."version" DESC) CONN
				WHERE CONN."status" = 'CONNECTED') CONN ON U.ID = CONN."toId"
        LEFT JOIN ( SELECT "id" as markedId, "markedWeight" FROM PUBLIC."TUser") markedUser ON CONN."fromId" = markedUser.markedId  
		GROUP BY U.ID) AS T2 USING(ID)
LEFT JOIN PUBLIC."TUserMetadata" AS MD ON T1.ID = MD."tUserId"
LEFT JOIN PUBLIC."TUserPublicMetrics" AS PM ON T1.ID = PM."tUserId";`;
    return trending.map((x) => {
      return {
        ...x,
        metadata: x.metadata ?? ({} as UserMetadata),
        public_metrics: x.public_metrics ?? ({} as UserPublicMetrics),
      } as UserFollowersDiff;
    });
  }

  _queryFindFollowersOf(
    status: 'CONNECTED' | 'DISCONNECTED',
    userId: string,
    limit: number,
    offset: number,
  ) {
    return Prisma.sql`
    SELECT ID,
      NAME,
      USERNAME,
      MARKED,
      CONN."createdAt" as addedAt
    FROM PUBLIC."TUser" U
    JOIN
      (SELECT *
        FROM
          (SELECT DISTINCT ON (_INNER."fromId", _INNER."toId") 
              _INNER."fromId",
              _INNER."toId",
              _INNER."status",
              _INNER."version",
              _INNER."createdAt"
            FROM PUBLIC."TConnection" _INNER
            WHERE _INNER."createdAt" <= TIMEZONE('utc', NOW())
              AND _INNER."toId" = ${userId}
            ORDER BY _INNER."fromId",
              _INNER."toId",
              _INNER."version" DESC) CONN
        WHERE CONN."status" = ${status}
        ) CONN ON U.ID = CONN."fromId"
        ORDER BY CONN."createdAt" DESC
    OFFSET ${offset} 
    LIMIT ${limit}`;
  }

  async findFollowersOf(
    userId: string,
    status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED',
    limit = 100,
    offset = 0,
  ) {
    type TQueryResult = TUser & {
      addedat: string;
    };

    const followers = await this.prisma.$queryRaw<TQueryResult[]>(
      this._queryFindFollowersOf(status, userId, limit, offset),
    );

    return followers.map((x) => {
      return {
        id: x.id,
        name: x.name,
        username: x.username,
        addedAt: new Date(x.addedat).getTime(),
      };
    });
  }

  _queryFindFollowingOf(
    status: 'CONNECTED' | 'DISCONNECTED',
    userId: string,
    limit: number,
    offset: number,
  ) {
    return Prisma.sql`
    SELECT ID,
    NAME,
    USERNAME,
    MARKED,
    CONN."createdAt" as addedAt
  FROM PUBLIC."TUser" U
  JOIN
    (SELECT *
      FROM
        (SELECT DISTINCT ON (_INNER."fromId", _INNER."toId") 
            _INNER."fromId",
            _INNER."toId",
            _INNER."status",
            _INNER."version",
            _INNER."createdAt"
          FROM PUBLIC."TConnection" _INNER
          WHERE _INNER."createdAt" <= TIMEZONE('utc', NOW())
            AND _INNER."fromId" = ${userId}
          ORDER BY _INNER."fromId",
            _INNER."toId",
            _INNER."version" DESC) CONN
      WHERE CONN."status" = ${status}
      ) CONN ON U.ID = CONN."toId"
      ORDER BY CONN."createdAt" DESC
  OFFSET ${offset} 
  LIMIT ${limit}
    `;
  }

  async findFollowingOf(
    userId: string,
    status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED',
    limit = 100,
    offset = 0,
  ) {
    type TQueryResult = TUser & {
      addedat: string;
    };

    const following = await this.prisma.$queryRaw<TQueryResult[]>(
      this._queryFindFollowingOf(status, userId, limit, offset),
    );

    return following.map((x) => {
      return {
        id: x.id,
        name: x.name,
        username: x.username,
        addedAt: new Date(x.addedat).getTime(),
      };
    });
  }

  async markedUsersLikedUser(username: string) {
    const user = await this.prisma.tUser.findFirst({
      where: { username: username },
      select: { id: true },
    });
    if (user === null) {
      throw new Error('Could not find userId');
    }

    type TQueryResult = TUser & {
      addedat: string;
    };

    const markedUsers = await this.prisma.$queryRaw<TQueryResult[]>`
    SELECT sq.* FROM (
      SELECT DISTINCT ON (TUSER.id) TLIKE."recordCreatedAt" as ADDEDAT, TUSER.*
      FROM public."TTweet" AS TWEET
      LEFT JOIN (SELECT * FROM public."TLike" AS TLIKE) TLIKE ON TLIKE."tTweetId" = TWEET.id
      LEFT JOIN (SELECT * FROM public."TUser" AS TUSER) TUSER ON TUSER."id" = TLIKE."tUserId"
      WHERE TWEET."authorId" = ${user.id}
      ORDER BY TUSER.id, ADDEDAT DESC
    ) as sq
    ORDER BY sq.ADDEDAT DESC;`;

    return markedUsers.map((x) => {
      return {
        id: x.id,
        name: x.name,
        username: x.username,
        addedAt: new Date(x.addedat).getTime(),
      };
    });
  }
}
