'use client';

import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { ReactNode } from 'react';

function getStoredToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('nhostCustomToken') || '';
  }
  return '';
}

export function CustomApolloProvider({ children }: { children: ReactNode }) {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';
  
  const endpoint = subdomain === 'local' 
    ? 'localhost:8080/v1/graphql' 
    : `${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

  const httpLink = new HttpLink({
    uri: `https://${endpoint}`,
    headers: () => ({
      Authorization: `Bearer ${getStoredToken()}`,
    }),
  });

  const wsLink = typeof window !== 'undefined' ? new GraphQLWsLink(
    createClient({
      url: `wss://${endpoint}`,
      connectionParams: () => ({
        headers: {
          Authorization: `Bearer ${getStoredToken()}`,
        },
      }),
    })
  ) : null;

  const splitLink = typeof window !== 'undefined' && wsLink ? split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
    },
    wsLink,
    httpLink
  ) : httpLink;

  const client = new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
