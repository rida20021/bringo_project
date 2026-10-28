import { ConvexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';

export const { auth, signIn, signOut, store, isAuthenticated } = ConvexAuth({
  providers: [Password, Anonymous],
});