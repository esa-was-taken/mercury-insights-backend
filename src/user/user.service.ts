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
    return {
      ...user,
      metadata: user.twitterMetaData ?? ({} as UserMetadata),
      public_metrics: user.twitterPublicMetrics ?? ({} as UserPublicMetrics),
    } as User;
  }

  async mostFollowedUsers(): Promise<UserWithFollowers[]> {
    type TUserWithFollowers = TUser & {
      marked_followers_ratio: number;
      followers: number;
      metadata: TUserMetadata;
      public_metrics: TUserPublicMetrics;
    };

    const popular = await this.prisma.$queryRaw<TUserWithFollowers[]>` 
      SELECT U.FOLLOWERS / NULLIF(PM.followers_count, 0.0) * 100.0 as marked_followers_ratio, U.*, row_to_json(MD.*) as metadata, row_to_json(PM.*) as public_metrics
      FROM
        (SELECT COUNT(CONN."toId") AS FOLLOWERS,
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

  async mostTrendingUsers(
    intervalStart: Date,
    intervalEnd: Date,
  ): Promise<UserFollowersDiff[]> {
    if (!intervalStart && !intervalEnd) {
      intervalStart = new Date();
      intervalStart.setHours(intervalStart.getHours() - 24);
      intervalEnd = new Date();
    }

    if (intervalEnd < intervalStart) {
      throw new Error('Start cannot be earlier than end');
    }

    type CustomTUserFollowingDiff = TUser & {
      marked_followers_ratio: number;
      followers: number;
      difference: number;
      metadata: TUserMetadata;
      public_metrics: TUserPublicMetrics;
    };

    const trending = await this.prisma.$queryRaw<CustomTUserFollowingDiff[]>`
  SELECT T1.FOLLOWERS / NULLIF(PM.followers_count, 0.0) * 100.0 as marked_followers_ratio, T1.*,
  row_to_json(MD.*) as metadata, row_to_json(PM.*) as public_metrics,
	COALESCE(T1.FOLLOWERS,
		0) - COALESCE(T2.FOLLOWERS,

								0) AS difference
FROM
	(SELECT ID,
			NAME,
			USERNAME,
			COUNT(CONN."toId") AS FOLLOWERS
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
		GROUP BY U.ID) AS T1
FULL JOIN
	(SELECT ID,
			NAME,
			USERNAME,
			COUNT(CONN."toId") AS FOLLOWERS
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

  async findFollowersOf(
    userId: string,
    limit = 100,
    offset = 0,
  ): Promise<User[]> {
    const followers = await this.prisma.$queryRaw<TUser[]>`
    SELECT ID,
      NAME,
      USERNAME,
      MARKED
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
        WHERE CONN."status" = 'CONNECTED'
        ORDER BY CONN."createdAt" DESC) CONN ON U.ID = CONN."fromId"
    OFFSET ${offset} 
    LIMIT ${limit}`;
    return followers.map((x) => {
      return { id: x.id, name: x.name, username: x.username } as User;
    });
  }

  async findFollowingOf(
    userId: string,
    limit = 100,
    offset = 0,
  ): Promise<User[]> {
    const following = await this.prisma.$queryRaw<TUser[]>`
    SELECT ID,
      NAME,
      USERNAME,
      MARKED
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
        WHERE CONN."status" = 'CONNECTED'
        ORDER BY CONN."createdAt" DESC) CONN ON U.ID = CONN."toId"
    OFFSET ${offset} 
    LIMIT ${limit}`;
    return following.map((x) => {
      return { id: x.id, name: x.name, username: x.username } as User;
    });
  }
}
