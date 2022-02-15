import * as dotenv from 'dotenv';
import { stringify } from 'querystring';
import { TwitterUser } from '../entity/twitter_user';
import { TwitterApi, TwitterApiReadOnly, UserV2 } from 'twitter-api-v2';
import { createConnection, Connection, getRepository } from 'typeorm';
import { TwitterRelationship } from '../entity/twitter_relationship';
import { Console } from 'console';

dotenv.config();

const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
const client = twitterClient.readOnly;

type User = { id: string | undefined; username: string };

async function getFollowingOfUserId(userId: string) {
  const request = await client.v2.following(userId, {
    asPaginator: true,
    max_results: 1000,
  });

  const followers: UserV2[] = [];
  for await (const follower of request) {
    followers.push(follower);
  }

  return followers;
}

async function getUserByUserId(userId: string) {
  const user = await client.v2.user(userId);
  return user.data;
}

async function getUserIdByUsername(userName: string) {
  const user = await client.v2.userByUsername(userName);

  return user.data.id;
}

async function getUserByUsername(userName: string) {
  const user = await client.v2.userByUsername(userName);

  return user.data;
}

function getChanges(__old: string[], __new: string[]) {
  const _old = new Set(__old);
  const _new = new Set(__new);

  const added = new Set([..._new].filter((x) => !_old.has(x)));
  const removed = new Set([..._old].filter((x) => !_new.has(x)));
  //const unchanged = new Set([..._old].filter((x) => _new.has(x)));

  return { added: added, removed: removed, unchanged: new Set<string>() };
}

async function fetchUserFromQueue() {
  // TODO: Fetch from database
  // Get a (marked) user from the database whose 'last_scrape_date' is the oldest
  const twitterUserRepository = getRepository(TwitterUser);
  const result = await twitterUserRepository
    .createQueryBuilder('user')
    .where("user.is_watched = 'true'")
    .orderBy('user.scraped_at', 'ASC', 'NULLS FIRST')
    .getOne();

  return result;
}

async function dbFetchUserFollowing(userId: string) {
  const twitterRelationshipRepository = getRepository(TwitterRelationship);
  const result = await twitterRelationshipRepository
    .createQueryBuilder('relationship')
    .where('relationship.from = :from', { from: userId })
    .distinctOn(['relationship.from', 'relationship.to'])
    .orderBy({
      'relationship.from': 'ASC',
      'relationship.to': 'ASC',
      'relationship.created_at': 'DESC',
    })
    .leftJoinAndSelect('relationship.to', 'user')
    .getMany();

  const results: string[] = [];
  result.forEach((relationship) => {
    if (!relationship.is_removed) {
      results.push(relationship.to.twitter_id);
    }
  });
  console.log(
    'Following: ',
    results.length,
    'Removed: ',
    result.length - results.length,
  );
  return results;
}

async function dbAddChanges(
  userId,
  users: UserV2[],
  changes: {
    added: Set<string>;
    removed: Set<string>;
    unchanged: Set<string>;
  },
) {
  const twitterRelationshipRepository = getRepository(TwitterRelationship);
  const user = await dbGetUserByUserId(userId);

  if (!user) {
    throw Error(`Could not find user! ${userId}`);
  }

  for (const followingUserId of changes.added) {
    const userInfo = users.find((x) => x.id === followingUserId);
    const followedUser = await dbCreateUserBase(
      userInfo.id,
      userInfo.name,
      userInfo.username,
    );

    const record = new TwitterRelationship();
    record.from = user;
    record.to = followedUser;
    record.is_removed = false;

    //console.log('Created relationship from to', user, followedUser);
    await twitterRelationshipRepository.save(record);
  }

  for (const followingUserId of changes.removed) {
    const followedUser = await dbGetUserByUserId(followingUserId);

    const record = new TwitterRelationship();
    record.from = user;
    record.to = followedUser;
    record.is_removed = true;

    //console.log('Created relationship from to', user, followedUser);
    await twitterRelationshipRepository.save(record);
  }
}

async function dbCreateUserBase(
  userId: string,
  name: string,
  userName: string,
  isWatched = false,
) {
  const twitterUserRepository = getRepository(TwitterUser);
  const existingUser = await dbGetUserByUserId(userId);
  if (existingUser) {
    //console.log(`User '${userName}' already exists.`);
    return existingUser;
  }

  const record = new TwitterUser();
  record.twitter_id = userId;
  record.twitter_name = name;
  record.twitter_username = userName;
  record.is_watched = isWatched;
  console.log(`Created user '${userName}' in database`);
  return await twitterUserRepository.save(record);
}
async function dbCreateUser(
  userId: string | undefined,
  userName: string | undefined = undefined,
  isWatched = false,
) {
  const twitterUserRepository = getRepository(TwitterUser);
  if (
    (userId && !(await dbGetUserByUserId(userId))) ||
    (userName && !(await dbGetUserByUserName(userName)))
  ) {
    const user = userId
      ? await getUserByUserId(userId)
      : await getUserByUsername(userName);

    const record = new TwitterUser();
    record.twitter_id = user.id;
    record.twitter_name = user.name;
    record.twitter_username = user.username;
    record.is_watched = isWatched;
    await twitterUserRepository.save(record);
    console.log('Created user:', user);
    return true;
  } else {
    //console.log(`User '${userId ? userId : userName}' already exists.`);
  }
  return false;
}

async function dbGetUserByUserId(userId: string) {
  // Check if a user exits in our Db
  const twitterUserRepository = getRepository(TwitterUser);
  const twitterUser = await twitterUserRepository.findOne({
    where: { twitter_id: userId },
  });
  return twitterUser;
}

async function dbGetUserByUserName(userName: string) {
  // Check if a user exits in our Db
  const twitterUserRepository = getRepository(TwitterUser);
  const twitterUser = await twitterUserRepository.findOne({
    where: { twitter_username: userName },
  });
  console.log(twitterUser);
  return twitterUser;
}

async function dbUpdateUserScrapeDone(user: TwitterUser) {
  // TODO: Update the user with a new datetime showing at which time it was scraped
  const twitterUserRepository = getRepository(TwitterUser);
  user.scraped_at = new Date();
  const result = await twitterUserRepository.save(user);
}

async function scrape(dbConn: Connection) {
  const user = await fetchUserFromQueue();
  console.log('Scraping user...', user);

  const oldFollowing = await dbFetchUserFollowing(user.twitter_id);
  const newFollowing = await getFollowingOfUserId(user.twitter_id);

  const followers = getChanges(
    oldFollowing,
    newFollowing.map((e) => e.id),
  );
  console.log('List:', followers);
  await dbAddChanges(user.twitter_id, newFollowing, followers);
  await dbUpdateUserScrapeDone(user);
}

async function main() {
  const dbConn: Connection = await createConnection();
  await dbConn.synchronize();
  await dbCreateUser(undefined, 'esa_was_taken', true);
  await scrape(dbConn);
}

main();
