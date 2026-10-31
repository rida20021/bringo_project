import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import type { MutationCtx } from './_generated/server';
import { hasAdminProfile, provisionRiderProfile } from './lib/provisioning';

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      /**
       * Runs for every password flow. Emails are normalized only on sign-up so
       * that accounts created before normalization keep working at sign-in.
       */
      profile(params) {
        const rawEmail = params.email;
        if (typeof rawEmail !== 'string') throw new Error('Email is required');
        const email = rawEmail.trim();
        if (!email) throw new Error('Email is required');

        if (params.flow === 'signUp') {
          const password = params.password;
          if (typeof password !== 'string' || password.length < 8) {
            throw new Error('Invalid password');
          }
          return { email: email.toLowerCase() };
        }

        return { email };
      },
    }),
  ],
  callbacks: {
    /**
     * Runs inside the `auth:store` mutation, in the same transaction as the
     * user document insert. Two cases matter here:
     *
     * - an admin provisioned the account: `provisioningRole` is set, so the
     *   rider profile is created atomically with the auth user;
     * - a public sign-up: only allowed while no admin exists yet, which keeps
     *   the one-time bootstrap working while enforcing closed registration.
     */
    async afterUserCreatedOrUpdated(ctx, args) {
      // Existing accounts are sign-ins, not sign-ups.
      if (args.existingUserId !== null) return;

      // The callback context is typed against `AnyDataModel`; the app schema is
      // the real one at runtime.
      const dbCtx = ctx as unknown as MutationCtx;

      if (args.profile.provisioningRole === 'rider') {
        const name = typeof args.profile.name === 'string' ? args.profile.name : '';
        const email = typeof args.profile.email === 'string' ? args.profile.email : '';
        await provisionRiderProfile(dbCtx, {
          userId: args.userId,
          displayName: name || email,
          email,
        });
        return;
      }

      if (await hasAdminProfile(dbCtx)) {
        throw new Error(
          'Registration is closed. Ask an administrator to create your account.'
        );
      }
    },
  },
});
