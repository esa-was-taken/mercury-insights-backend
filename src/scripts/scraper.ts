import * as dotenv from 'dotenv';
import { TwitterUser } from '../entity/twitter_user';
import {
  ApiRequestError,
  ApiResponseError,
  TwitterApi,
  TwitterRateLimit,
  UserV2,
} from 'twitter-api-v2';
import { Connection, createConnection, getRepository } from 'typeorm';
import { TwitterRelationship } from '../entity/twitter_relationship';

dotenv.config();

const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
const client = twitterClient.readOnly;

class CustomRatelimitError extends Error {
  rateLimit: TwitterRateLimit;

  constructor(_rateLimit: TwitterRateLimit) {
    super();
    this.rateLimit = _rateLimit;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoRetryOnRateLimitError<T>(callback: () => T | Promise<T>) {
  while (true) {
    try {
      return await callback();
    } catch (error) {
      if (
        (error instanceof ApiResponseError &&
          error.rateLimitError &&
          error.rateLimit) ||
        (error instanceof CustomRatelimitError && error.rateLimit)
      ) {
        const resetTimeout = error.rateLimit.reset * 1000; // convert to ms time instead of seconds time
        const timeToWait = resetTimeout - Date.now();
        console.log(
          `Ratelimited: sleeping for ${timeToWait / 1000.0 / 60.0} minutes`,
        );
        await sleep(timeToWait);
        continue;
      }
      throw error;
    }
  }
}

async function _fetchTwitterFollowingByUserId(userId: string) {
  const request = await client.v2.following(userId, {
    asPaginator: true,
    max_results: 1000,
  });

  const followers: UserV2[] = [];
  for await (const follower of request) {
    followers.push(follower);
  }

  // The above for loop does not throw any errors
  // so we have to do it ourselves. If we have hit the ratelimit
  // there are no guarantees that the following list is complete
  // we will retry when we are sure that we can request the whole list
  console.log('Ratelimit status:', request.rateLimit);
  if (request.rateLimit.remaining === 0) {
    throw new CustomRatelimitError(request.rateLimit);
  }

  return followers;
}

async function fetchTwitterFollowingByUserId(userId: string) {
  return await autoRetryOnRateLimitError(() =>
    _fetchTwitterFollowingByUserId(userId),
  );
}

async function fetchTwitterUserByUsername(userName: string) {
  const user = await autoRetryOnRateLimitError(
    async () => await client.v2.userByUsername(userName),
  );

  return user.data;
}

async function fetchStaleUser() {
  const twitterUserRepository = getRepository(TwitterUser);
  const result = await twitterUserRepository
    .createQueryBuilder('user')
    .where("user.is_watched = 'true'")
    .orderBy('user.scraped_at', 'ASC', 'NULLS FIRST')
    .getOne();

  return result;
}

async function fetchDbfollowedOfUserId(userId: string) {
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
  return results;
}

function computeChanges(__old: string[], __new: string[]) {
  const _old = new Set(__old);
  const _new = new Set(__new);

  const added = new Set([..._new].filter((x) => !_old.has(x)));
  const removed = new Set([..._old].filter((x) => !_new.has(x)));
  //const unchanged = new Set([..._old].filter((x) => _new.has(x)));

  return { added: added, removed: removed };
}

async function fetchDbUserByUserId(userId: string) {
  const twitterUserRepository = getRepository(TwitterUser);
  const twitterUser = await twitterUserRepository.findOne({
    where: { twitter_id: userId },
  });
  return twitterUser;
}

async function fetchDbUserByUserName(userName: string) {
  const twitterUserRepository = getRepository(TwitterUser);
  const twitterUser = await twitterUserRepository.findOne({
    where: { twitter_username: userName },
  });
  return twitterUser;
}

async function createUser(
  userInfo: UserV2,
  isWatched = false,
  surpressError = false,
) {
  const existingUser = userInfo.id
    ? await fetchDbUserByUserId(userInfo.id)
    : await fetchDbUserByUserName(userInfo.username);

  if (existingUser) {
    return existingUser;
  }

  if (!userInfo.id) {
    const result = await fetchTwitterUserByUsername(userInfo.username);
    if (!result) {
      if (surpressError) {
        console.log(`User '${userInfo.username}' does not exist on Twitter.`);
        return;
      }
      throw new Error(`User '${userInfo.username}' does not exist on Twitter.`);
    }
    userInfo.id = result.id;
    userInfo.name = result.name;
  }

  const twitterUserRepository = getRepository(TwitterUser);
  const record = new TwitterUser();
  record.twitter_id = userInfo.id;
  record.twitter_name = userInfo.name;
  record.twitter_username = userInfo.username;
  record.is_watched = isWatched;

  console.log('Created user:', record.twitter_username);
  return await twitterUserRepository.save(record);
}

async function _savefollowedChanges(
  user: TwitterUser,
  followedUsers: UserV2[],
  followedUserId: string,
  is_removed = false,
) {
  const twitterRelationshipRepository = getRepository(TwitterRelationship);
  const followedUserInfo = followedUsers.find((x) => x.id === followedUserId);
  const followedUser =
    (await fetchDbUserByUserId(followedUserInfo.id)) ??
    (await createUser(followedUserInfo));

  const record = new TwitterRelationship();
  record.from = user;
  record.to = followedUser;
  record.is_removed = is_removed;

  //console.log('Created relationship from to', user, followedUser);
  return await twitterRelationshipRepository.save(record);
}

async function savefollowedChanges(
  user: TwitterUser,
  followedUsers: UserV2[],
  changes: {
    added: Set<string>;
    removed: Set<string>;
  },
) {
  for (const followedUserId of changes.added) {
    await _savefollowedChanges(user, followedUsers, followedUserId, false);
  }

  for (const followedUserId of changes.removed) {
    await _savefollowedChanges(user, followedUsers, followedUserId, true);
  }
}

async function saveUserScraped(user: TwitterUser) {
  const twitterUserRepository = getRepository(TwitterUser);
  user.scraped_at = new Date();
  return await twitterUserRepository.save(user);
}

async function scrape() {
  try {
    // Get the marked user that was last scraped
    const markedUser = await fetchStaleUser();

    // Check that the twitter_id is defined for this user, otherwise fetch it
    // if (!markedUser.twitter_id) {
    //   const twitterUser = await fetchTwitterUserByUsername(
    //     markedUser.twitter_username,
    //   );
    //   markedUser.twitter_id = twitterUser.id;
    //   markedUser.twitter_name = twitterUser.name;
    //   const twitterUserRepository = getRepository(TwitterUser);
    //   twitterUserRepository.save(markedUser);
    // }
    console.log('Scraping:', markedUser);

    // Fetch the old followed from database
    const oldfollowed = await fetchDbfollowedOfUserId(markedUser.twitter_id);

    // Fetch the current followed from twitter API
    const newfollowed = await fetchTwitterFollowingByUserId(
      markedUser.twitter_id,
    );

    // Compute the changes
    const changes = computeChanges(
      oldfollowed,
      newfollowed.map((e) => e.id),
    );
    console.log(
      `Changes in following:\n\tadded(${changes.added.size})\n\tremoved(${changes.removed.size})`,
    );

    // Save changes to database
    await savefollowedChanges(markedUser, newfollowed, changes);

    // Set last scraped of user to now
    await saveUserScraped(markedUser);
  } catch (error) {
    if (error instanceof ApiResponseError || error instanceof ApiRequestError) {
      console.log('Encountered error requesting data from Twitter', error);
    }
  }
}

async function main(accounts: string[]) {
  const dbConn: Connection = await createConnection();
  await dbConn.synchronize();

  for (const account of accounts) {
    await createUser(
      { id: undefined, name: undefined, username: account },
      true,
      true,
    );
  }
  let iteration = 0;
  while (true) {
    await scrape();
    console.log(`Finished iteration (${iteration}) waiting for two minutes...`);
    iteration += 1;
    await sleep(1000 * 60 * 2); // Scrape every two minutes
  }
}

const markerAccounts = [
  '@___magnus___',
  '@0x_b1',
  '@0x9116',
  '@0xdaes',
  '@0xedenau',
  '@0xLordAlpha',
  '@0xmaki',
  '@0xminion',
  '@0xPEPO',
  '@0xshroom',
  '@0xShual',
  '@0xtuba',
  '@0xunihax0r',
  '@0xzewn',
  '@12_elysian',
  '@3azima85',
  '@500altcoins',
  '@alfalfaleeks',
  '@alpinestar17',
  '@Arthur_0x',
  '@AutomataEmily',
  '@ayumirage',
  '@bantg',
  '@bigdsenpai',
  '@bigmagicdao',
  '@bneiluj',
  '@boredGenius',
  '@boredGenius',
  '@CapitalGrug',
  '@ChainLinkGod',
  '@chocolatemastr',
  '@CL207',
  '@Cpcf5',
  '@criptopaul',
  '@crypt00_pepe',
  '@cryptik1e',
  '@crypto_condom',
  '@CryptoCanti',
  '@cryptodetweiler',
  '@cryptoninjaah',
  '@CryptoSamurai',
  '@cryptoyieldinfo',
  '@cuckqueeen',
  '@daaphex',
  '@danielesesta',
  '@dcfgod',
  '@DCP84',
  '@DeFi_Dad',
  '@defikhalil',
  '@DefiMoon',
  '@defiXBT',
  '@degencryptoinfo',
  '@DegenSpartan',
  '@devops199fan',
  '@duke_rick1',
  '@einsteindefi',
  '@farmerbrowndefi',
  '@fiskantes',
  '@gabrielhaines',
  '@gametheorizing',
  '@garrettz',
  '@GiganticRebirth',
  '@grugcapital',
  '@hasufl',
  '@hedgedhog7',
  '@hosseeb',
  '@hsakatrades',
  '@intocryptoast',
  '@jadler0',
  '@joey__santoro',
  '@juanmpellicer',
  '@knowerofmarkets',
  '@korpi87',
  '@lightcrypto',
  '@Lomashuk',
  '@loomdart',
  '@mewn21',
  '@mgnr_io',
  '@miyuki_crypto',
  '@MrCartographer_',
  '@n2ckchong',
  '@nanexcool',
  '@not3lau_capital',
  '@officer_cia',
  '@princebtc28',
  '@Rafi_0x',
  '@realwillhunting',
  '@rektfoodfarmer',
  '@Rewkang',
  '@riddle245',
  '@romeensheth',
  '@route2fi',
  '@ruisanape',
  '@RyAn__0x',
  '@samkazemian',
  '@santiagoroel',
  '@sassal0x',
  '@scupytrooples',
  '@sillypunts',
  '@smallcapscience',
  '@snipster33',
  '@StaniKulechov',
  '@statelayer',
  '@takimaeda2',
  '@tcbean',
  '@tetranode',
  '@tier10k',
  '@tztokchad',
  '@vfat0',
  '@w0000CE0',
  '@WartuII',
  '@woonomic',
  '@xenes1s',
  '@YuntCapital',
  '@ZenoCapitaI',
  '@zer0_alpha_',
  '0xSami_',
];

main(markerAccounts.map((acc) => acc.replace('@', '')));
