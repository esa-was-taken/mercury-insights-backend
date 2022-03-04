import * as dotenv from 'dotenv';
import { PrismaClient, ConnectionStatus, TUser } from '@prisma/client';
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

const fetchCurrentConnectionState = async () => {
  return await prisma.$queryRaw`SELECT * FROM (
    SELECT
    DISTINCT ON (_inner."fromId", _inner."toId") 
    _inner."fromId", _inner."toId", _inner."status", _inner."version", _inner."createdAt" 
    FROM public."TConnection" _inner
    ORDER BY _inner."fromId", _inner."toId", _inner."version" DESC
  ) conn 
  WHERE "status" = 'CONNECTED'`;
};

type CustomTUserFollowingDiff = TUser & {
  diff: number;
};

async function fetchMostGainedInInterval(
  snapShotStart: Date,
  snapShotEnd: Date,
  limit = 100,
  offset = 0,
) {
  if (snapShotEnd < snapShotStart) {
    throw new Error('Start cannot be earlier than end');
  }
  console.log(snapShotStart, snapShotEnd);
  const mostGained = await prisma.$queryRaw<CustomTUserFollowingDiff[]>`
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
						WHERE _INNER."createdAt" <= ${snapShotEnd}
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
						WHERE _INNER."createdAt" <= ${snapShotStart}
						ORDER BY _INNER."fromId",
							_INNER."toId",
							_INNER."version" DESC) CONN
				WHERE CONN."status" = 'CONNECTED') CONN ON U.ID = CONN."toId"
		GROUP BY U.ID) AS T2 USING(ID)
ORDER BY DIFF DESC
LIMIT ${limit}
OFFSET ${offset};`;
  return mostGained;
}

async function fetchMostFollowers(limit = 100, offset = 0) {
  const popular = await prisma.$queryRaw<TUser[]>` 
  SELECT    id,
  name,
  username,
  Count(conn."toId")
  FROM      public."TUser" u
  LEFT JOIN
    (
          SELECT *
          FROM   (
                                  SELECT DISTINCT
                                  ON (_inner."fromId", _inner."toId") 
                                                  _inner."fromId",
                                                  _inner."toId",
                                                  _inner."status",
                                                  _inner."version",
                                                  _inner."createdAt"
                                  FROM            public."TConnection" _inner
                                  ORDER BY        _inner."fromId",
                                                  _inner."toId",
                                                  _inner."version" DESC ) conn
          WHERE  conn."status" = 'CONNECTED') conn
  ON        u.id = conn."toId"
  GROUP BY  u.id
  ORDER BY  Count(conn."toId") DESC
  OFFSET ${offset} 
  LIMIT ${limit}`;
  return popular;
}

async function main() {
  // const start = new Date();
  // const end = new Date();
  // start.setHours(start.getHours() - 48);
  // end.setHours(end.getHours() - 0);
  // const result = await fetchMostGainedInInterval(start, end, 100);
  // //const result = await fetchMostFollowers(100);
  // console.log(
  //   result.map((x) => {
  //     return { username: x.username, gained: x.diff };
  //   }),
  // );
  // console.log(
  //   result.map((x) => {
  //     return {
  //       username: x.username,
  //       gained: x.diff,
  //     };
  //   }),
  // );
  const val = BigInt('1356006920792858625');
  console.log(val.toString());
  const result = await prisma.$queryRaw<TUser[]>`
    SELECT * FROM public."TUser" u
    WHERE u."id" = ${val.toString()}
    LIMIT 1;
  `;
  console.log(result);
  console.log(result[0].id.valueOf());
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
