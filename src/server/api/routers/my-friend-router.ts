import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 4: Implement mutual friend count
       *
       * Add `mutualFriendCount` to the returned result of this query. You can
       * either:
       *  (1) Make a separate query to count the number of mutual friends,
       *  then combine the result with the result of this query
       *  (2) BONUS: Use a subquery (hint: take a look at how
       *  `totalFriendCount` is implemented)
       *
       * Instructions:
       *  - Go to src/server/tests/friendship-request.test.ts, enable the test
       * scenario for Question 3
       *  - Run `yarn test` to verify your answer
       *
       * Documentation references:
       *  - https://kysely-org.github.io/kysely/classes/SelectQueryBuilder.html#innerJoin
       */

      // const mutualFriendRes = await countMutualFriend(
      //   ctx.db,
      //   ctx.session.userId,
      //   input.friendUserId
      // ).execute()

      // const countMutual = Number(mutualFriendRes[0]!.mutualFriendCount)

      const res = await ctx.db
        .selectFrom('users as friends')
        .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
        .innerJoin(
          userTotalFriendCount(ctx.db).as('userTotalFriendCount'),
          'userTotalFriendCount.userId',
          'friends.id'
        )
        .leftJoin(
          countMutualFriend(ctx.db, ctx.session.userId, input.friendUserId).as(
            'userMutualFriendCount'
          ),
          'userMutualFriendCount.userId',
          'friends.id'
        )
        .where('friendships.userId', '=', ctx.session.userId)
        .where('friendships.friendUserId', '=', input.friendUserId)
        .where(
          'friendships.status',
          '=',
          FriendshipStatusSchema.Values['accepted']
        )
        .select([
          'friends.id',
          'friends.fullName',
          'friends.phoneNumber',
          'totalFriendCount',
          'mutualFriendCount',
        ])
        .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
        .then(
          z.object({
            id: IdSchema,
            fullName: NonEmptyStringSchema,
            phoneNumber: NonEmptyStringSchema,
            totalFriendCount: CountSchema,
            mutualFriendCount: CountSchema,
          }).parse
        )
      // res.mutualFriendCount = countMutual
      return res
    }),
})

const getFriendByUserQueryFactory = (db: Database) => (user: number) =>
  db
    .selectFrom('friendships')
    .where('friendships.userId', '=', user)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])

const countMutualFriend = (
  db: Database,
  userId: number,
  friendUserId: number
) => {
  const getFriendByUserQuery = getFriendByUserQueryFactory(db)

  return getFriendByUserQuery(friendUserId)
    .where(
      'friendships.friendUserId',
      'in',
      getFriendByUserQuery(userId).select('friendships.friendUserId')
    )
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.id').as('mutualFriendCount'),
    ])
}

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}
