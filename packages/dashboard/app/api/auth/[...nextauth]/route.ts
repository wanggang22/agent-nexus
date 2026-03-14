import NextAuth from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";

const handler = NextAuth({
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_APP_KEY || "",
      clientSecret: process.env.TWITTER_APP_SECRET || "",
      // OAuth 1.0a — works with http://localhost
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.twitterId = (profile as any).id_str || (profile as any).id || account.providerAccountId;
        token.twitterUsername = (profile as any).screen_name || (profile as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).twitterId = token.twitterId;
      (session as any).twitterUsername = token.twitterUsername;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "agent-nexus-dev-secret",
});

export { handler as GET, handler as POST };
