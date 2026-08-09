import { GraphQLClient } from 'graphql-request';

export const adminClient = new GraphQLClient(
  process.env.NHOST_HASURA_URL || 'http://localhost:8080/v1/graphql',
  {
    headers: {
      'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret',
    },
  }
);
