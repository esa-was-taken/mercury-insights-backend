import { TwitterRelationship } from '../entity/twitter_relationship';
import { TwitterUser } from '../entity/twitter_user';
import { Connection, createConnection, getRepository } from 'typeorm';

async function subQuery() {
  const twitterRelationshipRepository = getRepository(TwitterRelationship);

  return await twitterRelationshipRepository
    .createQueryBuilder('relationship')
    .distinctOn(['relationship.from', 'relationship.to'])
    .orderBy({
      'relationship.from': 'DESC',
      'relationship.to': 'DESC',
      'relationship.created_at': 'DESC',
    })
    .leftJoinAndSelect('relationship.to', 'user.twitter_id')
    .getOne();
}

async function main() {
  const dbConn: Connection = await createConnection();
  await dbConn.synchronize();

  const twitterUserRepository = getRepository(TwitterUser);
  const twitterRelationshipRepository = getRepository(TwitterRelationship);

  const result = await twitterRelationshipRepository
    .createQueryBuilder()
    .select('user')
    .from((subQuery) => {
      return subQuery
        .select('relationship')
        .from(TwitterRelationship, 'relationship')
        .distinctOn(['relationship.from', 'relationship.to'])
        .orderBy({
          'relationship.from': 'ASC',
          'relationship.to': 'ASC',
          'relationship.created_at': 'DESC',
        })
        .leftJoinAndSelect('relationship.to', 'user');
    }, 'relationship')
    .getRawOne();
  console.log(result);
  //console.log(await subQuery());
}

main();
