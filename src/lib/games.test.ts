import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getFilteredGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns categories and publishers ordered by name', async () => {
        await db.insert(categories).values([
            { name: 'Puzzle', description: 'puzzle' },
            { name: 'Adventure', description: 'adventure' },
        ]);
        await db.insert(publishers).values([
            { name: 'Studio Two', description: 'two' },
            { name: 'Studio One', description: 'one' },
        ]);

        expect(await getAllCategories(db)).toEqual([
            { id: expect.any(Number), name: 'Adventure' },
            { id: expect.any(Number), name: 'Puzzle' },
        ]);
        expect(await getAllPublishers(db)).toEqual([
            { id: expect.any(Number), name: 'Studio One' },
            { id: expect.any(Number), name: 'Studio Two' },
        ]);
    });

    it('filters by one or more categories', async () => {
        await seedGames(db, 1);
        const [strategy] = await db.select({ id: categories.id }).from(categories);
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle' })
            .returning({ id: categories.id });
        const [publisher] = await db.select({ id: publishers.id }).from(publishers);
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Puzzle description',
            starRating: 4,
            categoryId: puzzle.id,
            publisherId: publisher.id,
        });

        expect((await getFilteredGames(db, [strategy.id])).map((game) => game.title)).toEqual(['Game 01']);
        expect((await getFilteredGames(db, [strategy.id, puzzle.id])).map((game) => game.title))
            .toEqual(['Game 01', 'Puzzle Game']);
    });

    it('filters by publisher and combines publisher with categories', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'strategy' })
            .returning({ id: categories.id });
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle' })
            .returning({ id: categories.id });
        const [publisherOne] = await db
            .insert(publishers)
            .values({ name: 'Publisher One', description: 'one' })
            .returning({ id: publishers.id });
        const [publisherTwo] = await db
            .insert(publishers)
            .values({ name: 'Publisher Two', description: 'two' })
            .returning({ id: publishers.id });
        await db.insert(games).values([
            { title: 'Alpha', description: 'alpha', starRating: 4, categoryId: strategy.id, publisherId: publisherOne.id },
            { title: 'Beta', description: 'beta', starRating: 4, categoryId: puzzle.id, publisherId: publisherOne.id },
            { title: 'Gamma', description: 'gamma', starRating: 4, categoryId: puzzle.id, publisherId: publisherTwo.id },
        ]);

        expect((await getFilteredGames(db, [], publisherOne.id)).map((game) => game.title)).toEqual(['Alpha', 'Beta']);
        expect((await getFilteredGames(db, [puzzle.id], publisherOne.id)).map((game) => game.title)).toEqual(['Beta']);
    });

    it('returns all games when no filters are supplied', async () => {
        await seedGames(db, 2);
        expect((await getFilteredGames(db)).map((game) => game.title)).toEqual(['Game 01', 'Game 02']);
    });
});
