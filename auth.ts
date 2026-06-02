import type { User } from '@/app/lib/definitions';
import { users } from '@/app/lib/placeholder-data';
import bcrypt from 'bcrypt';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import postgres from 'postgres';
import { z } from 'zod';
import { authConfig } from './auth.config';

const sql = process.env.POSTGRES_URL
  ? postgres(process.env.POSTGRES_URL, { ssl: 'require' })
  : null;

async function getFallbackUser(email: string): Promise<User | undefined> {
  const user = users.find((candidate) => candidate.email === email);
  if (!user) return undefined;
  return {
    ...user,
    password: await bcrypt.hash(user.password, 10),
    role: 'admin', // fallback role
  };
}

async function getUser(email: string): Promise<User | undefined> {
  if (!sql) return getFallbackUser(email);
  try {
    const user = await sql<User[]>`SELECT * FROM users WHERE email=${email}`;
    return user[0] ?? (await getFallbackUser(email));
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return getFallbackUser(email);
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const { email, password } = parsedCredentials.data;
        const user = await getUser(email);

        if (!user) return null;

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role, // ← tambahan
        };
      },
    }),
  ],
});