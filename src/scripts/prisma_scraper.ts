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

const twitterClient = new TwitterApi(process.env.TWITTER_API_BEARER || '');
const client = twitterClient.readOnly;

/*
  TWITTER
*/

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
    'user.fields': 'created_at',
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

  return user.data ? user.data : undefined;
}

/*
   DATABASE 
*/

async function fetchLastScrapedMarkedUser() {
  return await prisma.tUser.findFirst({
    where: {
      marked: true,
    },
    orderBy: {
      scrapedAt: 'asc',
    },
  });
}

async function fetchDbFollowingOfUserId(userId: string) {
  const following = await prisma.tConnection.findMany({
    where: {
      fromId: userId,
    },
    distinct: ['fromId', 'toId'],
    orderBy: {
      version: 'desc',
    },
    select: {
      toId: true,
      status: true,
    },
  });

  return following
    .filter((x) => x.status === ConnectionStatus.CONNECTED)
    .map((x) => x.toId);
}

function computeChanges(__old: string[], __new: string[]) {
  const _old = new Set(__old);
  const _new = new Set(__new);

  return {
    added: new Set([..._new].filter((x) => !_old.has(x))),
    removed: new Set([..._old].filter((x) => !_new.has(x))),
  };
}
async function fetchOrCreateUser(newUser: UserV2) {
  const existingUser = await prisma.tUser.findUnique({
    where: { id: newUser.id },
  });

  if (existingUser) {
    return existingUser;
  }

  const createdUser = await prisma.tUser.create({
    data: {
      id: newUser.id,
      name: newUser.name,
      username: newUser.username,
      accountCreatedAt: newUser.created_at,
      marked: false,
    },
  });

  console.log('Created new user:', newUser.username);
  return createdUser;
}

async function _savefollowedChanges(
  user: TUser,
  followedUsers: UserV2[],
  followedUserId: string,
  is_removed = false,
) {
  const followedUserInfo = followedUsers.find((x) => x.id === followedUserId);
  const followedUser = followedUserInfo
    ? await fetchOrCreateUser(followedUserInfo)
    : await prisma.tUser.findUnique({ where: { id: followedUserId } }); // If the info is undefined, this user is being removed

  const previousConnection = await prisma.tConnection.findFirst({
    where: { fromId: user.id, toId: followedUser.id },
    orderBy: { version: 'desc' },
  });

  const version = previousConnection ? previousConnection.version + 1 : 0;
  const status = is_removed
    ? ConnectionStatus.DISCONNECTED
    : ConnectionStatus.CONNECTED;
  const connection = await prisma.tConnection.create({
    data: {
      from: { connect: { id: user.id } },
      to: { connect: { id: followedUser.id } },
      version: version,
      status: status,
    },
  });

  return connection;
}

async function savefollowedChanges(
  user: TUser,
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

async function createMarkedUserFromUsername(userName: string) {
  const existingUser = await prisma.tUser.findFirst({
    where: { username: { equals: userName, mode: 'insensitive' } },
  });
  if (existingUser) {
    return existingUser;
  }

  const user = await fetchTwitterUserByUsername(userName);
  if (!user) {
    console.log('Could not find Twitter account:', userName);
    return;
  }

  console.log('Created new user:', user.username);
  return await prisma.tUser.create({
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      accountCreatedAt: user.created_at,
      marked: true,
    },
  });
}

async function updateMarkedUser(user: TUser) {
  const updatedUser = await prisma.tUser.update({
    where: {
      id: user.id,
    },
    data: {
      scrapedAt: new Date(),
    },
  });
  return updatedUser;
}

async function scrape() {
  try {
    // Get the marked user that was last scraped
    const markedUser = await fetchLastScrapedMarkedUser();
    console.log('Scraping:', markedUser);

    // Fetch the old followed from database
    const oldfollowed = await fetchDbFollowingOfUserId(markedUser.id);

    // Fetch the current followed from twitter API
    const newfollowed = await fetchTwitterFollowingByUserId(markedUser.id);

    // Compute the changes in following
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
    await updateMarkedUser(markedUser);
  } catch (error) {
    if (error instanceof ApiResponseError || error instanceof ApiRequestError) {
      console.log('Encountered error requesting data from Twitter', error);
    }
  }
}

async function main(accounts: string[]) {
  for (const username of accounts) {
    await createMarkedUserFromUsername(username);
  }

  let iteration = 0;
  while (true) {
    await scrape();
    console.log(`Finished iteration (${iteration}) waiting for 1.5 minutes...`);
    iteration += 1;
    await sleep(1000 * 60 * 1.5); // Scrape every two minutes
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

const test = ['esa_was_taken', '@0x9116'];

main(markerAccounts.map((acc) => acc.replace('@', '')))
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
