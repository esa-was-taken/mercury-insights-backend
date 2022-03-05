module.exports = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'mercury',
  password: 'mercury',
  database: 'mercurydb',
  entities: [],
  synchronize: true,
  entities: ['src/entity/**/*.ts'],
  //dropSchema: true,
};
