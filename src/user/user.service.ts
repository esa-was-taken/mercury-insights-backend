import { Injectable } from '@nestjs/common';
import { TUser, Prisma } from '@prisma/client';
import { interval } from 'rxjs';
import {
  User,
  UserWithFollowers,
  UserFollowersDiff,
} from 'src/interfaces/user.interface';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUser(userId: string): Promise<User> {
    const user = await this.prisma.tUser.findUnique({ where: { id: userId } });
    return { id: user.id, username: user.username, name: user.name } as User;
  }

  async getUserByUserName(userName: string): Promise<User> {
    const user = await this.prisma.tUser.findFirst({
      where: { username: userName },
    });
    return { id: user.id, username: user.username, name: user.name } as User;
  }

  async mostFollowedUsers(
    limit = 100,
    offset = 0,
  ): Promise<UserWithFollowers[]> {
    type TUserWithFollowers = TUser & {
      followers: number;
    };

    const popular = await this.prisma.$queryRaw<TUserWithFollowers[]>` 
      SELECT *
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
          GROUP BY U.ID
          ORDER BY FOLLOWERS DESC) U
      LEFT JOIN PUBLIC."TUserMetadata" AS MD ON U.ID = MD."tUserId"
      LEFT JOIN PUBLIC."TUserPublicMetrics" AS PM ON U.ID = PM."tUserId"
      OFFSET ${offset} 
      LIMIT ${limit}
    `;
    return popular.map((x) => {
      return {
        id: x.id,
        name: x.name,
        username: x.username,
        followers: x.followers,
        marked: x.marked,
      } as UserWithFollowers;
    });
  }

  async mostTrendingUsers(
    intervalStart: Date,
    intervalEnd: Date,
    limit = 100,
    offset = 0,
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
      diff: number;
    };

    const trending = await this.prisma.$queryRaw<CustomTUserFollowingDiff[]>`
  SELECT T1.ID,
	T1.NAME,
	T1.USERNAME,
	COALESCE(T1.FOLLOWERS,
		0) - COALESCE(T2.FOLLOWERS,

								0) AS DIFF
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
ORDER BY DIFF DESC
LIMIT ${Math.trunc(limit)}
OFFSET ${Math.trunc(offset)};`;
    return trending.map((x) => {
      return {
        id: x.id,
        name: x.name,
        username: x.username,
        difference: x.diff,
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
