import { Decimal } from '@prisma/client-runtime-utils'

import type { Input } from '../../__helpers__/integrationTest'

// This suite owns the Kingbase MySQL compatibility contract. It starts from
// the MySQL behavioural baseline, but Kingbase-specific differences stay here.
export const scenarios = [
  {
    name: 'findUnique where PK',
    up: `
        create table teams (
          id int primary key not null,
          name varchar(50) not null unique
        );
        insert into teams (id, name) values (1, 'a');
        insert into teams (id, name) values (2, 'b');
      `,
    do: (client) => {
      return client.teams.findUnique({ where: { id: 2 } })
    },
    expect: {
      id: 2,
      name: 'b',
    },
  },
  {
    name: 'findUnique where PK with select',
    up: `
        create table teams (
          id int primary key not null,
          name varchar(50) not null unique,
          email varchar(50) not null unique
        );
        insert into teams (id, name, email) values (1, 'a', 'a@a');
        insert into teams (id, name, email) values (2, 'b', 'b@b');
      `,
    do: (client) => {
      return client.teams.findUnique({
        where: { id: 2 },
        select: { name: true },
      })
    },
    expect: {
      name: 'b',
    },
  },
  {
    name: 'findUnique where PK with include',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique
        );
        create table posts (
          id bigint primary key auto_increment not null,
          user_id bigint not null,
          title varchar(50) not null
        );
        ALTER TABLE posts ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE;
        insert into users (email) values ('ada@prisma.io');
        insert into users (email) values ('ema@prisma.io');
        insert into posts (user_id, title) values (1, 'A');
        insert into posts (user_id, title) values (1, 'B');
        insert into posts (user_id, title) values (2, 'C');
      `,
    do: (client) => {
      return client.users.findUnique({
        where: { id: 1 },
        include: { posts: true },
      })
    },
    expect: {
      email: 'ada@prisma.io',
      id: BigInt(1),
      posts: [
        {
          id: BigInt(1),
          title: 'A',
          user_id: BigInt(1),
        },
        {
          id: BigInt(2),
          title: 'B',
          user_id: BigInt(1),
        },
      ],
    },
  },
  {
    name: 'create with data',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null unique
        );
      `,
    do: (client) => {
      return client.teams.create({ data: { name: 'c' } })
    },
    expect: {
      id: BigInt(1),
      name: 'c',
    },
  },
  {
    name: 'create with empty data and SQL default',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null default 'alice'
        );
      `,
    do: (client) => {
      return client.teams.create({ data: {} })
    },
    expect: {
      id: BigInt(1),
      name: 'alice',
    },
  },
  {
    todo: true,
    name: 'create with empty data and serial',
    up: `
        create table teams (
          id serial primary key not null
        );
      `,
    do: (client) => {
      return client.teams.create({ data: {} })
    },
    expect: {
      id: BigInt(1),
      name: 'alice',
    },
  },
  {
    name: 'update where with numeric data',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null unique
        );
        insert into teams (name) values ('c');
      `,
    do: (client) => {
      return client.teams.update({
        where: { id: 1 },
        data: { name: 'd' },
      })
    },
    expect: {
      id: BigInt(1),
      name: 'd',
    },
  },
  {
    name: 'update where with boolean data',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null unique,
          active boolean not null default true
        );
        insert into teams (name) values ('c');
      `,
    do: (client) => {
      return client.teams.update({
        where: { id: 1 },
        data: { active: false },
      })
    },
    expect: {
      id: BigInt(1),
      name: 'c',
      active: false,
    },
  },
  {
    name: 'update where with boolean data and select',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null unique,
          active boolean not null default true
        );
        insert into teams (name) values ('c');
      `,
    do: (client) => {
      return client.teams.update({
        where: { id: 1 },
        data: { active: false },
        select: { active: true },
      })
    },
    expect: {
      active: false,
    },
  },
  {
    name: 'update where with string data',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null unique
        );
        insert into teams (name) values ('c');
      `,
    do: (client) => {
      return client.teams.update({
        where: { name: 'c' },
        data: { name: 'd' },
      })
    },
    expect: {
      id: BigInt(1),
      name: 'd',
    },
  },
  {
    name: 'updateMany where with string data - check returned count',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null
        );
        insert into teams (name) values ('c');
        insert into teams (name) values ('c');
      `,
    do: (client) => {
      return client.teams.updateMany({
        where: { name: 'c' },
        data: { name: 'd' },
      })
    },
    expect: {
      count: 2,
    },
  },
  {
    name: 'updateMany where with string data - check findMany',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name varchar(50) not null
        );
        insert into teams (name) values ('c');
        insert into teams (name) values ('c');
      `,
    do: async (client) => {
      await client.teams.updateMany({
        where: { name: 'c' },
        data: { name: 'd' },
      })
      return client.teams.findMany()
    },
    expect: [
      {
        id: BigInt(1),
        name: 'd',
      },
      {
        id: BigInt(2),
        name: 'd',
      },
    ],
  },
  {
    name: 'findUnique where unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique
        );
        insert into users (email) values ('ada@prisma.io');
      `,
    do: (client) => {
      return client.users.findUnique({ where: { email: 'ada@prisma.io' } })
    },
    expect: {
      id: BigInt(1),
      email: 'ada@prisma.io',
    },
  },
  {
    name: 'findUnique where composite unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null,
          name varchar(50) not null,
          unique key users_email_name_key(email, name)
        );
        insert into users (email, name) values ('ada@prisma.io', 'Ada');
      `,
    do: (client) => {
      return client.users.findUnique({
        where: {
          email_name: { email: 'ada@prisma.io', name: 'Ada' },
        },
      })
    },
    expect: {
      id: BigInt(1),
      email: 'ada@prisma.io',
      name: 'Ada',
    },
  },
  {
    name: 'update where composite unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null,
          name varchar(50) not null,
          unique key users_email_name_key(email, name)
        );
        insert into users (email, name) values ('ada@prisma.io', 'Ada');
      `,
    do: (client) => {
      return client.users.update({
        where: {
          email_name: { email: 'ada@prisma.io', name: 'Ada' },
        },
        data: { name: 'Marco' },
      })
    },
    expect: {
      id: BigInt(1),
      email: 'ada@prisma.io',
      name: 'Marco',
    },
  },
  {
    name: 'delete where composite unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null,
          name varchar(50) not null,
          unique key users_email_name_key(email, name)
        );
        insert into users (email, name) values ('ada@prisma.io', 'Ada');
      `,
    do: (client) => {
      return client.users.delete({
        where: {
          email_name: { email: 'ada@prisma.io', name: 'Ada' },
        },
      })
    },
    expect: {
      id: BigInt(1),
      email: 'ada@prisma.io',
      name: 'Ada',
    },
  },
  {
    name: 'findMany - email text',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email text
        );
        insert into users (email) values ('ada@prisma.io');
        insert into users (email) values (null);
      `,
    do: (client) => {
      return client.users.findMany()
    },
    expect: [
      {
        email: 'ada@prisma.io',
        id: BigInt(1),
      },
      {
        email: null,
        id: BigInt(2),
      },
    ],
  },
  {
    name: 'findMany where unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique
        );
        insert into users (email) values ('ada@prisma.io');
      `,
    do: (client) => {
      return client.users.findMany({ where: { email: 'ada@prisma.io' } })
    },
    expect: [
      {
        id: BigInt(1),
        email: 'ada@prisma.io',
      },
    ],
  },
  {
    name: 'findMany - email varchar(50) not null unique',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique
        );
        insert into users (email) values ('ada@prisma.io');
        insert into users (email) values ('ema@prisma.io');
      `,
    do: (client) => {
      return client.users.findMany()
    },
    expect: [
      {
        id: BigInt(1),
        email: 'ada@prisma.io',
      },
      {
        id: BigInt(2),
        email: 'ema@prisma.io',
      },
    ],
  },
  {
    name: 'findUnique where unique with foreign key and unpack',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique
        );
        create table posts (
          id bigint primary key auto_increment not null,
          user_id bigint not null,
          title varchar(50) not null
        );
        ALTER TABLE posts ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE;
        insert into users (email) values ('ada@prisma.io');
        insert into users (email) values ('ema@prisma.io');
        insert into posts (user_id, title) values (1, 'A');
        insert into posts (user_id, title) values (1, 'B');
        insert into posts (user_id, title) values (2, 'C');
      `,
    do: (client) => {
      return client.users.findUnique({ where: { email: 'ada@prisma.io' } }).posts()
    },
    expect: [
      {
        id: BigInt(1),
        title: 'A',
        user_id: BigInt(1),
      },
      {
        id: BigInt(2),
        title: 'B',
        user_id: BigInt(1),
      },
    ],
  },
  {
    name: 'findMany where contains and boolean',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.findMany({
        where: {
          title: { contains: 'A' },
          published: true,
        },
      })
    },
    expect: [
      {
        id: BigInt(1),
        published: true,
        title: 'A',
      },
    ],
  },
  {
    name: 'findMany where OR[contains, contains] ',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.findMany({
        where: {
          OR: [{ title: { contains: 'A' } }, { title: { contains: 'C' } }],
          published: true,
        },
      })
    },
    expect: [
      {
        id: BigInt(1),
        published: true,
        title: 'A',
      },
      {
        id: BigInt(3),
        published: true,
        title: 'C',
      },
    ],
  },
  {
    name: 'upsert (update)',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.upsert({
        where: { id: 1 },
        create: { title: 'D', published: true },
        update: { title: 'D', published: true },
      })
    },
    expect: {
      id: BigInt(1),
      published: true,
      title: 'D',
    },
  },
  {
    name: 'upsert (create)',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.upsert({
        where: { id: 4 },
        create: { title: 'D', published: false },
        update: { title: 'D', published: true },
      })
    },
    expect: {
      id: BigInt(4),
      published: false,
      title: 'D',
    },
  },
  {
    name: 'findMany orderBy asc',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.findMany({
        orderBy: {
          title: 'asc',
        },
      })
    },
    expect: [
      {
        id: BigInt(1),
        published: true,
        title: 'A',
      },
      {
        id: BigInt(2),
        published: false,
        title: 'B',
      },
      {
        id: BigInt(3),
        published: true,
        title: 'C',
      },
    ],
  },
  {
    name: 'findMany orderBy desc',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published boolean not null default false
        );
        insert into posts (title, published) values ('A', true);
        insert into posts (title, published) values ('B', false);
        insert into posts (title, published) values ('C', true);
      `,
    do: (client) => {
      return client.posts.findMany({
        orderBy: {
          title: 'desc',
        },
      })
    },
    expect: [
      {
        id: BigInt(3),
        published: true,
        title: 'C',
      },
      {
        id: BigInt(2),
        published: false,
        title: 'B',
      },
      {
        id: BigInt(1),
        published: true,
        title: 'A',
      },
    ],
  },
  {
    name: 'findMany - default enum',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title) values ('C');
      `,
    do: (client) => {
      return client.posts.findMany()
    },
    expect: [
      {
        id: BigInt(1),
        published: 'DRAFT',
        title: 'A',
      },
      {
        id: BigInt(2),
        published: 'DRAFT',
        title: 'B',
      },
      {
        id: BigInt(3),
        published: 'DRAFT',
        title: 'C',
      },
    ],
  },
  {
    todo: true,
    name: 'create with data - not null enum',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title) values ('C');
      `,
    do: (client) => {
      return client.posts.create({ data: { title: 'D' } })
    },
    expect: {},
  },
  {
    name: 'update with data - not null enum',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title) values ('C');
      `,
    do: (client) => {
      return client.posts.update({
        where: { id: 1 },
        data: { published: 'PUBLISHED' },
      })
    },
    expect: {
      id: BigInt(1),
      published: 'PUBLISHED',
      title: 'A',
    },
  },
  {
    name: 'updateMany with data - not null enum - check count',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title) values ('C');
      `,
    do: (client) => {
      return client.posts.updateMany({
        data: { published: 'PUBLISHED' },
      })
    },
    expect: {
      count: 3,
    },
  },
  {
    name: 'update with data - not null enum - check findMany',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title) values ('C');
      `,
    do: async (client) => {
      await client.posts.updateMany({
        data: { published: 'PUBLISHED' },
      })
      logKingbaseScenarioStep('updateMany completed')

      const posts = await client.posts.findMany()
      logKingbaseScenarioStep('findMany completed')
      return posts
    },
    expect: [
      {
        id: BigInt(1),
        published: 'PUBLISHED',
        title: 'A',
      },
      {
        id: BigInt(2),
        published: 'PUBLISHED',
        title: 'B',
      },
      {
        id: BigInt(3),
        published: 'PUBLISHED',
        title: 'C',
      },
    ],
  },
  {
    name: 'deleteMany where enum - check count',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title, published) values ('C', 'PUBLISHED');
      `,
    do: async (client) => {
      return await client.posts.deleteMany({
        where: { published: 'DRAFT' },
      })
    },
    expect: {
      count: 2,
    },
  },
  {
    name: 'deleteMany where enum - check findMany',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          published enum ('DRAFT','PUBLISHED') not null default 'DRAFT'
        );
        insert into posts (title) values ('A');
        insert into posts (title) values ('B');
        insert into posts (title, published) values ('C', 'PUBLISHED');
      `,
    do: async (client) => {
      await client.posts.deleteMany({
        where: { published: 'DRAFT' },
      })
      return client.posts.findMany()
    },
    expect: [
      {
        id: BigInt(3),
        published: 'PUBLISHED',
        title: 'C',
      },
    ],
  },
  {
    name: 'findMany where contains',
    up: `
        create table crons (
          id bigint primary key auto_increment,
          job varchar(50) unique not null,
          frequency text
        );
        insert into crons (job, frequency) values ('j1', '* * * * *');
        insert into crons (job, frequency) values ('j20', '* * * * 1-5');
        insert into crons (job, frequency) values ('j21', '* * * * 1-5');
      `,
    do: (client) => {
      return client.crons.findMany({ where: { job: { contains: 'j2' } } })
    },
    expect: [
      {
        frequency: '* * * * 1-5',
        id: BigInt(2),
        job: 'j20',
      },
      {
        frequency: '* * * * 1-5',
        id: BigInt(3),
        job: 'j21',
      },
    ],
  },
  {
    name: 'findMany where startsWith',
    up: `
        create table crons (
          id bigint primary key auto_increment,
          job varchar(50) unique not null,
          frequency text
        );
        insert into crons (job, frequency) values ('j1', '* * * * *');
        insert into crons (job, frequency) values ('j20', '* * * * 1-5');
        insert into crons (job, frequency) values ('j21', '* * * * 1-5');
      `,
    do: (client) => {
      return client.crons.findMany({ where: { job: { startsWith: 'j2' } } })
    },
    expect: [
      {
        frequency: '* * * * 1-5',
        id: BigInt(2),
        job: 'j20',
      },
      {
        frequency: '* * * * 1-5',
        id: BigInt(3),
        job: 'j21',
      },
    ],
  },
  {
    name: 'findMany where endsWith',
    up: `
        create table crons (
          id bigint primary key auto_increment,
          job varchar(50) unique not null,
          frequency text
        );
        insert into crons (job, frequency) values ('j1', '* * * * *');
        insert into crons (job, frequency) values ('j20', '* * * * 1-5');
        insert into crons (job, frequency) values ('j21', '* * * * 1-5');
      `,
    do: (client) => {
      return client.crons.findMany({ where: { job: { endsWith: '1' } } })
    },
    expect: [
      {
        frequency: '* * * * *',
        id: BigInt(1),
        job: 'j1',
      },
      {
        frequency: '* * * * 1-5',
        id: BigInt(3),
        job: 'j21',
      },
    ],
  },
  {
    name: 'findMany where in[string]',
    up: `
        create table crons (
          id bigint primary key auto_increment,
          job varchar(50) unique not null,
          frequency text
        );
        insert into crons (job, frequency) values ('j1', '* * * * *');
        insert into crons (job, frequency) values ('j20', '* * * * 1-5');
        insert into crons (job, frequency) values ('j21', '* * * * 1-5');
      `,
    do: (client) => {
      return client.crons.findMany({ where: { job: { in: ['j20', 'j1'] } } })
    },
    expect: [
      {
        frequency: '* * * * *',
        id: BigInt(1),
        job: 'j1',
      },
      {
        frequency: '* * * * 1-5',
        id: BigInt(2),
        job: 'j20',
      },
    ],
  },
  {
    name: 'findUnique where in[]',
    todo: true,
    up: `
        create table crons (
          id bigint primary key auto_increment,
          job varchar(50) unique not null,
          frequency text
        );
        insert into crons (job, frequency) values ('j1', '* * * * *');
        insert into crons (job, frequency) values ('j20', '* * * * 1-5');
        insert into crons (job, frequency) values ('j21', '* * * * 1-5');
      `,
    do: (client) => {
      return client.crons.findUnique({ where: { job: { in: ['j20', 'j1'] } } })
    },
    expect: [
      {
        frequency: '* * * * *',
        id: BigInt(1),
        job: 'j1',
      },
      {
        frequency: '* * * * 1-5',
        id: BigInt(2),
        job: 'j20',
      },
    ],
  },
  {
    name: 'findMany where datetime lte - check instanceof Date',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        insert into posts (title, created_at) values ('A', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('B', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('C', '2020-01-14 11:10:19');
      `,
    do: async (client) => {
      const posts = await client.posts.findMany({
        where: { created_at: { lte: new Date() } },
      })
      posts.forEach((post) => {
        expect(post.created_at).toBeInstanceOf(Date)
        delete post.created_at
      })
      return posts
    },
    expect: [
      {
        id: BigInt(1),
        title: 'A',
      },
      {
        id: BigInt(2),
        title: 'B',
      },
      {
        id: BigInt(3),
        title: 'C',
      },
    ],
  },
  {
    name: 'findMany where timestamp gte than now',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          created_at timestamp not null default now()
        );
        insert into posts (title, created_at) values ('A', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('B', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('C', '2020-01-14 11:10:19');
      `,
    do: (client) => {
      return client.posts.findMany({
        where: { created_at: { gte: new Date() } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where timestamp gt than now',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          created_at timestamp not null default now()
        );
        insert into posts (title, created_at) values ('A', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('B', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('C', '2020-01-14 11:10:19');
      `,
    do: (client) => {
      return client.posts.findMany({
        where: { created_at: { gt: new Date() } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where timestamp lt than now',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          created_at timestamp not null default now()
        );
        insert into posts (title, created_at) values ('A', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('B', '2020-01-14 11:10:19');
        insert into posts (title, created_at) values ('C', '2020-01-14 11:10:19');
      `,
    do: async (client) => {
      const posts = await client.posts.findMany({
        where: { created_at: { lt: new Date() } },
      })
      posts.forEach((post) => {
        expect(post.created_at).toBeInstanceOf(Date)
        delete post.created_at
      })
      return posts
    },
    expect: [
      {
        id: BigInt(1),
        title: 'A',
      },
      {
        id: BigInt(2),
        title: 'B',
      },
      {
        id: BigInt(3),
        title: 'C',
      },
    ],
  },
  {
    name: 'update where integer data',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null
        );
        insert into teams (token) values (11);
      `,
    do: (client) => {
      return client.teams.update({
        where: { token: 11 },
        data: { token: 10 },
      })
    },
    expect: {
      id: BigInt(1),
      token: 10,
    },
  },
  {
    name: 'findMany where datetime exact',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) },
      })
    },
    expect: [
      {
        id: BigInt(1),
        time: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)),
      },
    ],
  },
  {
    name: 'findMany where datetime gt',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: { gt: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where datetime gte',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: { gte: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) } },
      })
    },
    expect: [
      {
        id: BigInt(1),
        time: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)),
      },
    ],
  },
  {
    name: 'findMany where datetime lt',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: { lt: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where datetime lte',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: { lte: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) } },
      })
    },
    expect: [
      {
        id: BigInt(1),
        time: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)),
      },
    ],
  },
  {
    name: 'findMany where datetime not',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values ('2018-09-04 00:00:00');
      `,
    do: (client) => {
      return client.events.findMany({
        where: { time: { not: new Date(Date.UTC(2018, 8, 4, 0, 0, 0, 0)) } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where null',
    up: `
        create table events (
          id bigint primary key auto_increment,
          time datetime
        );
        insert into events (time) values (NULL);
        insert into events (time) values (NULL);
        insert into events (time) values (NULL);
      `,
    do: (client) => {
      return client.events.findMany({ where: { time: null } })
    },
    expect: [
      {
        id: BigInt(1),
        time: null,
      },
      {
        id: BigInt(2),
        time: null,
      },
      {
        id: BigInt(3),
        time: null,
      },
    ],
  },
  {
    name: 'findMany where empty in[]',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        insert into teams (token, name) values (11, 'a');
        insert into teams (token, name) values (22, 'b');
      `,
    do: (client) => {
      return client.teams.findMany({ where: { id: { in: [] } } })
    },
    expect: [],
  },
  {
    name: 'findMany where id empty in[] and token in[]',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        insert into teams (token, name) values (11, 'a');
        insert into teams (token, name) values (22, 'b');
      `,
    do: (client) => {
      return client.teams.findMany({
        where: { id: { in: [] }, token: { in: [11, 22] } },
      })
    },
    expect: [],
  },
  {
    name: 'findMany where in[integer]',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        insert into teams (token, name) values (11, 'a');
        insert into teams (token, name) values (22, 'b');
      `,
    do: (client) => {
      return client.teams.findMany({ where: { token: { in: [11, 22] } } })
    },
    expect: [
      {
        id: BigInt(1),
        name: 'a',
        token: 11,
      },
      {
        id: BigInt(2),
        name: 'b',
        token: 22,
      },
    ],
  },
  {
    name: 'findMany where notIn[]',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        insert into teams (token, name) values (11, 'a');
        insert into teams (token, name) values (22, 'b');
      `,
    do: (client) => {
      return client.teams.findMany({ where: { token: { notIn: [11, 22] } } })
    },
    expect: [],
  },
  {
    name: 'findMany where empty notIn[]',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        insert into teams (token, name) values (11, 'a');
        insert into teams (token, name) values (22, 'b');
      `,
    do: (client) => {
      return client.teams.findMany({ where: { token: { notIn: [] } } })
    },
    expect: [
      {
        id: BigInt(1),
        name: 'a',
        token: 11,
      },
      {
        id: BigInt(2),
        name: 'b',
        token: 22,
      },
    ],
  },
  {
    todo: true,
    name: 'findMany where null',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          token integer unique not null,
          name varchar(50) not null
        );
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique,
          team_id int references teams (id)
        );
        insert into teams (token, name) values (1, 'a');
        insert into users (email, team_id) values ('a', NULL);
        insert into users (email, team_id) values ('b', 1);
      `,
    do: (client) => {
      return client.users.findMany({ where: { team_id: null } })
    },
    expect: [
      {
        email: 'a',
        team_id: null,
      },
    ],
  },
  {
    // Kingbase does not recognize MySQL's `utf8mb4_unicode_ci` name. A portable
    // replacement depends on collations installed by the target server, so this
    // remains a compatibility gap rather than silently testing another behavior.
    todo: true,
    name: 'findMany where - case insensitive field',
    up: `
        create table users (
          id bigint primary key auto_increment not null,
          email varchar(50) not null unique COLLATE utf8mb4_unicode_ci 
        );
        insert into users (email) values ('max@prisma.io');
      `,
    do: (client) => {
      return client.users.findMany({ where: { email: 'MAX@PRISMA.IO' } })
    },
    expect: [
      {
        email: 'max@prisma.io',
        id: BigInt(1),
      },
    ],
  },
  {
    name: 'findMany where decimal',
    up: `
        create table exercises (
          id bigint primary key auto_increment not null,
          distance decimal(5, 3) not null
        );
        insert into exercises (distance) values (12.213);
      `,
    do: (client) => {
      return client.exercises.findMany({ where: { distance: 12.213 } })
    },
    expect: [
      {
        distance: new Decimal('12.213'),
        id: BigInt(1),
      },
    ],
  },
  {
    name: 'findUnique where decimal',
    up: `
        create table exercises (
          id bigint primary key auto_increment not null,
          distance decimal(5, 3) not null unique
        );
        insert into exercises (distance) values (12.213);
      `,
    do: (client) => {
      return client.exercises.findUnique({ where: { distance: 12.213 } })
    },
    expect: {
      distance: new Decimal('12.213'),
      id: BigInt(1),
    },
  },
  {
    todo: true,
    // null
    name: 'findUnique where decimal - default value',
    up: `
        create table exercises (
          id bigint primary key auto_increment not null,
          distance decimal(5, 3) not null unique default (12.3)
        );
        insert into exercises (distance) values (12.213);
        insert into exercises (id) values (2);
      `,
    do: (client) => {
      return client.exercises.findUnique({ where: { distance: 12.3 } })
    },
    expect: {
      distance: new Decimal('12.3'),
      id: BigInt(2),
    },
  },
  {
    name: 'create bigint data',
    up: `
        create table migrate (
          version bigint not null primary key
        );
      `,
    do: (client) => {
      return client.migrate.create({ data: { version: 1 } })
    },
    expect: {
      version: BigInt(1),
    },
  },
  {
    name: 'findUnique where composite PK',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.findUnique({
        where: { name_key: { key: 'b', name: 'a' } },
      })
    },
    expect: {
      email: 'd',
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'update where composite PK',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.update({
        where: { name_key: { key: 'b', name: 'a' } },
        data: { email: 'e' },
      })
    },
    expect: {
      email: 'e',
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'upsert where composite PK - update',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.upsert({
        where: { name_key: { key: 'b', name: 'a' } },
        create: { name: '1', key: '2', value: '3', email: '4' },
        update: { email: 'e' },
      })
    },
    expect: {
      email: 'e',
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'upsert where composite PK - create',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.upsert({
        where: { name_key: { key: 'd', name: 'a' } },
        create: { name: '1', key: '2', value: '3', email: '4' },
        update: { email: 'e' },
      })
    },
    expect: {
      email: '4',
      key: '2',
      name: '1',
      value: '3',
    },
  },
  {
    name: 'delete where composite PK',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.delete({
        where: { name_key: { key: 'b', name: 'a' } },
      })
    },
    expect: {
      email: 'd',
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'findUnique where unique composite',
    up: `
        create table variables (
          id bigint primary key auto_increment not null,
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          unique key variables_name_key_key(name, \`key\`)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.findUnique({
        where: { name_key: { key: 'b', name: 'a' } },
      })
    },
    expect: {
      email: 'd',
      id: BigInt(1),
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'findUnique where unique composite (PK is a composite)',
    up: `
        create table variables (
          name varchar(50) not null,
          \`key\` varchar(50) not null,
          value varchar(50) not null,
          email varchar(50) not null,
          primary key(name, \`key\`),
          unique key variables_value_email_key(value, email)
        );
        insert into variables (name, \`key\`, value, email) values ('a', 'b', 'c', 'd');
      `,
    do: (client) => {
      return client.variables.findUnique({
        where: { value_email: { value: 'c', email: 'd' } },
      })
    },
    expect: {
      email: 'd',
      key: 'b',
      name: 'a',
      value: 'c',
    },
  },
  {
    name: 'findUnique where composite PK with foreign key',
    up: `
          create table a (
            one integer not null,
            two integer not null,
            primary key (one, two)
          );
          create table b (
            id bigint primary key auto_increment not null,
            one integer not null,
            two integer not null
          );
          ALTER TABLE b ADD FOREIGN KEY (one, two) REFERENCES a(one, two);
          insert into a (one, two) values (1, 2);
          insert into b (one, two) values (1, 2);
        `,
    do: (client) => {
      return client.a.findUnique({ where: { one_two: { one: 1, two: 2 } } })
    },
    expect: {
      one: 1,
      two: 2,
    },
  },
  {
    todo: true,
    name: 'findUnique - list all possible datatypes',
    up: `
        create table crazy (
          c1 bigint,
          c2 int8,
          ...
        );
      `,
    do: (client) => {
      return client.crazy.findUnique({
        where: { value_email: { value: 'c', email: 'd' } },
      })
    },
    expect: {
      // TODO
    },
  },
  {
    name: 'updateMany where null - check findMany',
    up: `
        create table teams (
          id bigint primary key auto_increment not null,
          name text
        );
        insert into teams (name) values ('a');
        insert into teams (name) values (NULL);
        insert into teams (name) values (NULL);
      `,
    do: async (client) => {
      await client.teams.updateMany({
        data: { name: 'b' },
        where: { name: null },
      })
      return client.teams.findMany()
    },
    expect: [
      {
        id: BigInt(1),
        name: 'a',
      },
      {
        id: BigInt(2),
        name: 'b',
      },
      {
        id: BigInt(3),
        name: 'b',
      },
    ],
  },
  {
    //todo investigate before merging PR
    todo: true,
    name: 'findMany on column_name_that_becomes_empty_string',
    up: `
        CREATE TABLE \`column_name_that_becomes_empty_string\` (
          \`field1\` int(11) NOT NULL AUTO_INCREMENT,
          \`12345\` int(11) DEFAULT NULL,
          PRIMARY KEY (\`field1\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
        
        CREATE TABLE \`invalid_enum_value_name\` (
          \`field1\` int(11) NOT NULL AUTO_INCREMENT,
          \`here_be_enum\` enum('Y','N','123','$§!') DEFAULT NULL,
          PRIMARY KEY (\`field1\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
        
        CREATE TABLE \`no_unique_identifier\` (
          \`field1\` int(11) DEFAULT NULL,
          \`field2\` int(11) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1;

        CREATE TABLE \`unsupported_type\` (
          \`field1\` int(11) NOT NULL AUTO_INCREMENT,
          \`unsupported\` binary(50) DEFAULT NULL,
          PRIMARY KEY (\`field1\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `,
    do: async (client) => {
      return await client.column_name_that_becomes_empty_string.findMany({})
    },
    expect: [],
  },
  {
    //todo investigate before merging PR
    todo: true,
    name: 'findUnique - check typeof js object is object for Json field',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          data JSON
        );
      `,
    do: async (client) => {
      await client.posts.create({
        data: {
          title: 'A',
          data: {
            somekey: 'somevalue',
            somekeyarray: ['somevalueinsidearray'],
          },
        },
      })
      const posts = await client.posts.findMany()
      posts.forEach((post) => {
        expect(typeof post.data).toEqual('object')
      })
      return posts
    },
    expect: [
      {
        id: BigInt(1),
        title: 'A',
        data: {
          somekey: 'somevalue',
          somekeyarray: ['somevalueinsidearray'],
        },
      },
    ],
  },
  {
    //todo investigate before merging PR
    todo: true,
    name: 'findUnique - check typeof Date is string for Json field',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          data JSON 
        );
        insert into posts (title, data) values ('A', '"2020-01-14T11:10:19.573Z"');
      `,
    do: async (client) => {
      await client.posts.create({
        data: {
          title: 'B',
          data: new Date('2020-01-01'),
        },
      })
      const posts = await client.posts.findMany()
      posts.forEach((post) => {
        expect(typeof post.data).toEqual('string')
      })
      return posts
    },
    expect: [
      {
        id: BigInt(1),
        title: 'A',
        data: '2020-01-14T11:10:19.573Z',
      },
      {
        id: BigInt(2),
        title: 'B',
        data: '2020-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    //todo investigate before merging PR
    todo: true,
    name: 'findUnique - check typeof array for Json field with array',
    up: `
        create table posts (
          id bigint primary key auto_increment not null,
          title varchar(50) not null,
          data JSON not null
        );
        `,
    do: async (client) => {
      await client.posts.create({
        data: {
          title: 'Hello',
          data: ['some', 'array', 1, 2, 3, { object: 'value' }],
        },
      })
      const post = await client.posts.findUnique({
        where: { id: 1 },
      })
      return post
    },
    expect: {
      id: BigInt(1),
      title: 'Hello',
      data: ['some', 'array', 1, 2, 3, { object: 'value' }],
    },
  },
  {
    name: 'Kingbase native MySQL types supported by Prisma Client round trip through the driver adapter',
    up: `
      CREATE TABLE kingbase_native_types (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tiny_bool TINYINT(1) NOT NULL,
        tiny_int TINYINT NOT NULL,
        medium_int MEDIUMINT NOT NULL,
        bits BIT(8) NOT NULL,
        binary_value VARBINARY(3) NOT NULL,
        blob_value BLOB NOT NULL,
        text_value TINYTEXT NOT NULL,
        year_value YEAR NOT NULL,
        date_value DATE NOT NULL,
        time_value TIME(3) NOT NULL,
        datetime_value DATETIME(3) NOT NULL,
        timestamp_value TIMESTAMP(3) NOT NULL,
        json_value JSON NOT NULL
      );
    `,
    do: async (client) => {
      await client.kingbase_native_types.create({
        data: {
          tiny_bool: 1,
          tiny_int: 7,
          medium_int: 123,
          bits: new Uint8Array([0b10101010]),
          binary_value: new Uint8Array([1, 2, 3]),
          blob_value: new Uint8Array([4, 5, 6]),
          text_value: 'Kingbase',
          year_value: 2024,
          date_value: new Date('2024-01-02T00:00:00.000Z'),
          time_value: new Date('1970-01-01T12:34:56.789Z'),
          datetime_value: new Date('2024-01-02T03:04:05.678Z'),
          timestamp_value: new Date('2024-01-03T04:05:06.789Z'),
          json_value: { database: 'kingbase', values: [1, 2, 3] },
        },
      })

      const row = await client.kingbase_native_types.findUnique({ where: { id: 1 } })

      return {
        ...row,
        bits: Array.from(row.bits),
        binary_value: Array.from(row.binary_value),
        blob_value: Array.from(row.blob_value),
        date_value: row.date_value.toISOString(),
        time_value: row.time_value.toISOString(),
        datetime_value: row.datetime_value.toISOString(),
        timestamp_value: row.timestamp_value.toISOString(),
      }
    },
    expect: {
      id: 1,
      tiny_bool: 1,
      tiny_int: 7,
      medium_int: 123,
      bits: [0b10101010],
      binary_value: [1, 2, 3],
      blob_value: [4, 5, 6],
      text_value: 'Kingbase',
      year_value: 2024,
      date_value: '2024-01-02T00:00:00.000Z',
      time_value: '1970-01-01T12:34:56.789Z',
      datetime_value: '2024-01-02T03:04:05.678Z',
      timestamp_value: '2024-01-03T04:05:06.789Z',
      json_value: { database: 'kingbase', values: [1, 2, 3] },
    },
  },
  {
    name: 'Kingbase BIT(1) round trips as a Prisma Boolean through the driver adapter',
    up: `
      CREATE TABLE kingbase_bit_boolean (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        value BIT(1) NOT NULL
      );
    `,
    do: async (client) => {
      await client.kingbase_bit_boolean.create({ data: { value: true } })
      await client.kingbase_bit_boolean.create({ data: { value: false } })

      return client.kingbase_bit_boolean.findMany({ orderBy: { id: 'asc' } })
    },
    expect: [
      { id: 1, value: true },
      { id: 2, value: false },
    ],
  },
  {
    name: 'Kingbase raw queries preserve literal and comment question marks',
    up: `
      CREATE TABLE kingbase_raw_queries (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        value VARCHAR(50) NOT NULL
      );
      INSERT INTO kingbase_raw_queries (value) VALUES ('before');
    `,
    do: async (client, ctx) => {
      const table = `${quoteIdentifier(ctx.id)}.${quoteIdentifier('kingbase_raw_queries')}`

      await client.$executeRawUnsafe(`UPDATE ${table} SET value = ? WHERE id = ?`, 'after', 1)

      return client.$queryRawUnsafe(
        `
        SELECT id, value, '?' AS literal
        FROM ${table}
        /* ? */
        WHERE value = ? -- ?
      `,
        'after',
      )
    },
    expect: [{ id: 1, value: 'after', literal: '?' }],
  },
  {
    name: 'interactive transaction rolls back',
    up: `
      CREATE TABLE teams (
        id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        name VARCHAR(50) NOT NULL
      );
    `,
    do: async (client) => {
      await client
        .$transaction(async (tx) => {
          await tx.teams.create({ data: { name: 'rolled back' } })
          throw new Error('rollback this transaction')
        })
        .catch(() => undefined)

      return client.teams.count()
    },
    expect: 0,
  },
  {
    name: 'BIT Boolean and byte filters retain their values after updates',
    up: `
      CREATE TABLE bit_filters (id INT PRIMARY KEY, flag BIT(1), bits BIT(8));
    `,
    do: async (client) => {
      for (const [id, flag, byte] of [
        [1, false, 0],
        [2, true, 170],
        [3, false, 255],
      ] as const) {
        await client.bit_filters.create({ data: { id, flag, bits: new Uint8Array([byte]) } })
      }
      const matches = {
        false: await client.bit_filters.findMany({
          where: { flag: false },
          orderBy: { id: 'asc' },
          select: { id: true },
        }),
        true: await client.bit_filters.findMany({ where: { flag: true }, select: { id: true } }),
        bytes: await client.bit_filters.findMany({
          where: { bits: { in: [new Uint8Array([0]), new Uint8Array([255])] } },
          orderBy: { id: 'asc' },
          select: { id: true },
        }),
      }
      const updated = await client.bit_filters.updateMany({
        where: { flag: false, bits: new Uint8Array([0]) },
        data: { flag: true, bits: new Uint8Array([85]) },
      })
      const after = await client.bit_filters.findMany({
        where: { flag: true, bits: new Uint8Array([85]) },
        select: { id: true },
      })
      return { matches, updated, after }
    },
    expect: {
      matches: { false: [{ id: 1 }, { id: 3 }], true: [{ id: 2 }], bytes: [{ id: 1 }, { id: 3 }] },
      updated: { count: 1 },
      after: [{ id: 1 }],
    },
  },
  {
    name: 'signed and unsigned integer boundaries survive introspection and writes',
    up: `
      CREATE TABLE integer_boundaries (
        id INT PRIMARY KEY,
        tiny TINYINT NOT NULL, unsigned_tiny TINYINT UNSIGNED NOT NULL,
        small SMALLINT NOT NULL, unsigned_small SMALLINT UNSIGNED NOT NULL,
        medium MEDIUMINT NOT NULL, unsigned_medium MEDIUMINT UNSIGNED NOT NULL,
        integer_value INT NOT NULL, big BIGINT NOT NULL
      );
    `,
    do: async (client) => {
      const rows = [
        {
          id: 1,
          tiny: -128,
          unsigned_tiny: 0,
          small: -32768,
          unsigned_small: 0,
          medium: -8388608,
          unsigned_medium: 0,
          integer_value: -2147483648,
          big: -9223372036854775808n,
        },
        {
          id: 2,
          tiny: 127,
          unsigned_tiny: 255,
          small: 32767,
          unsigned_small: 65535,
          medium: 8388607,
          unsigned_medium: 16777215,
          integer_value: 2147483647,
          big: 9223372036854775807n,
        },
      ]
      for (const data of rows) await client.integer_boundaries.create({ data })
      return client.integer_boundaries.findMany({ orderBy: { id: 'asc' } })
    },
    expect: [
      {
        id: 1,
        tiny: -128,
        unsigned_tiny: 0,
        small: -32768,
        unsigned_small: 0,
        medium: -8388608,
        unsigned_medium: 0,
        integer_value: -2147483648,
        big: -9223372036854775808n,
      },
      {
        id: 2,
        tiny: 127,
        unsigned_tiny: 255,
        small: 32767,
        unsigned_small: 65535,
        medium: 8388607,
        unsigned_medium: 16777215,
        integer_value: 2147483647,
        big: 9223372036854775807n,
      },
    ],
  },
  {
    name: 'binary and text type families preserve multibyte text and NULL',
    up: `
      CREATE TABLE type_families (
        id INT PRIMARY KEY, fixed BINARY(4), variable VARBINARY(32),
        tiny_blob TINYBLOB, blob_value BLOB, medium_blob MEDIUMBLOB, long_blob LONGBLOB,
        char_value CHAR(4), varchar_value VARCHAR(32), tiny_text TINYTEXT, text_value TEXT, medium_text MEDIUMTEXT, long_text LONGTEXT
      );
    `,
    do: async (client) => {
      const bytes = new Uint8Array([0, 127, 128, 255])
      const text = '金仓KES'
      await client.type_families.create({
        data: {
          id: 1,
          fixed: bytes,
          variable: bytes,
          tiny_blob: bytes,
          blob_value: bytes,
          medium_blob: bytes,
          long_blob: bytes,
          char_value: 'ABCD',
          varchar_value: text,
          tiny_text: text,
          text_value: text,
          medium_text: text,
          long_text: text,
        },
      })
      await client.type_families.create({ data: { id: 2 } })
      return client.type_families.findMany({ orderBy: { id: 'asc' } })
    },
    expect: [
      {
        id: 1,
        fixed: new Uint8Array([0, 127, 128, 255]),
        variable: new Uint8Array([0, 127, 128, 255]),
        tiny_blob: new Uint8Array([0, 127, 128, 255]),
        blob_value: new Uint8Array([0, 127, 128, 255]),
        medium_blob: new Uint8Array([0, 127, 128, 255]),
        long_blob: new Uint8Array([0, 127, 128, 255]),
        char_value: 'ABCD',
        varchar_value: '金仓KES',
        tiny_text: '金仓KES',
        text_value: '金仓KES',
        medium_text: '金仓KES',
        long_text: '金仓KES',
      },
      {
        id: 2,
        fixed: null,
        variable: null,
        tiny_blob: null,
        blob_value: null,
        medium_blob: null,
        long_blob: null,
        char_value: null,
        varchar_value: null,
        tiny_text: null,
        text_value: null,
        medium_text: null,
        long_text: null,
      },
    ],
  },
  {
    name: 'TIME DATE and DATETIME filters bind the introspected temporal types',
    up: `
      CREATE TABLE temporal_filters (id INT PRIMARY KEY, d DATE NOT NULL, t TIME(3) NOT NULL, dt DATETIME(3) NOT NULL);
    `,
    do: async (client) => {
      const data = {
        id: 1,
        d: new Date('2024-07-31T00:00:00.000Z'),
        t: new Date('1970-01-01T12:34:56.789Z'),
        dt: new Date('2024-07-31T12:34:56.789Z'),
      }
      await client.temporal_filters.create({ data })
      return client.temporal_filters.findMany({ where: { d: data.d, t: data.t, dt: data.dt } })
    },
    expect: [
      {
        id: 1,
        d: new Date('2024-07-31T00:00:00.000Z'),
        t: new Date('1970-01-01T12:34:56.789Z'),
        dt: new Date('2024-07-31T12:34:56.789Z'),
      },
    ],
  },
  {
    name: 'createMany skipDuplicates respects a unique index',
    up: `CREATE TABLE bulk_rows (id INT PRIMARY KEY, name VARCHAR(32) NOT NULL UNIQUE);`,
    do: async (client) => {
      const result = await client.bulk_rows.createMany({
        data: [
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Ada' },
          { id: 3, name: 'Lin' },
        ],
        skipDuplicates: true,
      })
      const rows = await client.bulk_rows.findMany({ orderBy: { id: 'asc' } })
      return { result, rows }
    },
    expect: {
      result: { count: 2 },
      rows: [
        { id: 1, name: 'Ada' },
        { id: 3, name: 'Lin' },
      ],
    },
  },
  {
    // No-path root string filters are excluded: native MySQL reproduces the same issue.
    name: 'JSON path filters bind MySQL JSON values',
    up: `
      CREATE TABLE json_filters (id INT PRIMARY KEY, payload JSON NOT NULL);
      INSERT INTO json_filters VALUES (1, '{"kind":"fruit","tags":["apple"]}'), (2, '"hello world"'), (3, '"other"');
    `,
    do: async (client) => ({
      path: await client.json_filters.findMany({
        where: { payload: { path: '$.kind', equals: 'fruit' } },
        select: { id: true },
      }),
    }),
    expect: { path: [{ id: 1 }] },
  },
  {
    name: 'full-text relevance cursor pagination preserves numeric scores',
    previewFeatures: ['fullTextSearch'],
    up: `
      CREATE TABLE search_documents (id INT PRIMARY KEY, title VARCHAR(100) NOT NULL);
      INSERT INTO search_documents VALUES (1, 'prisma prisma prisma'), (2, 'prisma prisma'), (3, 'prisma'), (4, 'other');
    `,
    do: (client) =>
      client.search_documents.findMany({
        where: { title: { search: 'prisma' } },
        orderBy: [{ _relevance: { fields: ['title'], search: 'prisma', sort: 'desc' } }, { id: 'asc' }],
        cursor: { id: 2 },
        skip: 1,
        take: 2,
        select: { id: true },
      }),
    expect: [{ id: 3 }],
  },
  {
    name: 'aggregate groupBy and batch transactions use MySQL models',
    up: `CREATE TABLE team_scores (id INT PRIMARY KEY, team VARCHAR(32) NOT NULL, score INT NOT NULL);`,
    do: async (client) => {
      await client.$transaction([
        client.team_scores.create({ data: { id: 1, team: 'A', score: 10 } }),
        client.team_scores.create({ data: { id: 2, team: 'A', score: 20 } }),
        client.team_scores.create({ data: { id: 3, team: 'B', score: 30 } }),
      ])
      return client.team_scores.groupBy({ by: ['team'], _sum: { score: true }, _count: true, orderBy: { team: 'asc' } })
    },
    expect: [
      { team: 'A', _sum: { score: 30 }, _count: 2 },
      { team: 'B', _sum: { score: 30 }, _count: 1 },
    ],
  },
] as Input['scenarios']

function logKingbaseScenarioStep(step: string): void {
  if (process.env.DEBUG_KINGBASE_MYSQL_INTEGRATION === '1') {
    process.stderr.write(`[kingbase-mysql] runtime: update with data - not null enum - check findMany: ${step}\n`)
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}
