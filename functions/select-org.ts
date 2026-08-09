import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { verifyNhostToken } from './_utils/jwt';
import { adminClient } from './_lib/hasura-admin';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { org_id } = req.body;
    if (!org_id) return res.status(400).json({ error: 'org_id is required' });

    const authHeader = req.headers.authorization;
    let decoded;
    try {
      decoded = verifyNhostToken(authHeader);
    } catch (e: any) {
      return res.status(401).json({ error: e.message });
    }

    const userId = decoded.sub;

    const GET_MEMBER_QUERY = `
      query GetMember($org_id: uuid!, $user_id: uuid!) {
        org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }) {
          role
        }
      }
    `;

    const data: any = await adminClient.request(GET_MEMBER_QUERY, { org_id, user_id: userId });
    
    if (!data.org_members || data.org_members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    const role = data.org_members[0].role;
    const secret = process.env.NHOST_JWT_SECRET;
    
    if (!secret) {
      return res.status(500).json({ error: 'Server misconfiguration: NHOST_JWT_SECRET is missing' });
    }

    const customToken = jwt.sign({
      sub: userId,
      "https://hasura.io/jwt/claims": {
        "x-hasura-user-id": userId,
        "x-hasura-org-id": org_id,
        "x-hasura-org-role": role,
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"]
      }
    }, secret, { algorithm: "HS256", expiresIn: "1h" });

    return res.status(200).json({ token: customToken });

  } catch (error: any) {
    console.error('Error in select-org:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
