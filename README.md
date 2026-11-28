![Prisma](https://i.imgur.com/h6UIYTu.png)

<div align="center">
  <h1>Prisma</h1>
  <a href="https://www.npmjs.com/package/prisma"><img src="https://img.shields.io/npm/v/prisma.svg?style=flat" /></a>
  <a href="https://github.com/prisma/prisma/blob/v7/CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" /></a>
  <a href="https://github.com/prisma/prisma/blob/v7/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202-blue" /></a>
  <a href="https://pris.ly/discord"><img alt="Discord" src="https://img.shields.io/discord/937751382725886062?label=Discord"></a>
  <br />
  <br />
  <a href="https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres">Quickstart</a>
  <span>  •  </span>
  <a href="https://www.prisma.io/">Website</a>
  <span>  •  </span>
  <a href="https://www.prisma.io/docs/">Docs</a>
  <span>  •  </span>
  <a href="https://github.com/prisma/prisma-examples/">Examples</a>
  <span>  •  </span>
  <a href="https://www.prisma.io/blog">Blog</a>
  <span>  •  </span>
  <a href="https://pris.ly/discord?utm_source=github&utm_medium=prisma&utm_content=repo_readme">Discord</a>
  <span>  •  </span>
  <a href="https://pris.ly/x?utm_source=github&utm_medium=prisma&utm_content=repo_readme">Twitter</a>
  <span>  •  </span>
  <a href="https://pris.ly/youtube?utm_source=github&utm_medium=prisma&utm_content=repo_readme">Youtube</a>
  <br />
  <hr />
</div>

> **This is the Prisma ORM 7.x line, maintained on the `v7` branch.** The default branch of this repository now hosts [Prisma Next](https://github.com/prisma/prisma/tree/main), a TypeScript rewrite of Prisma ORM. The `prisma` and `@prisma/*` packages on npm are published from here.

## KingbaseES（KB）适配

本仓库是基于 Prisma ORM 7.10.0 的金仓 KingbaseES 社区适配版本。KB 项目使用本节中的包名、命令和配置；下方保留的上游 Prisma 文档使用官方包名。

用户通过 npm 安装配套的 `prisma-kb`、`@prisma-kb/client` 和 `@prisma-kb/adapter-kb`，无需拉取源码仓库或自行编译。已有官方 Prisma 项目接入 KingbaseES 时，应将 CLI 和 Client 切换为本适配发行版的配套包，并按照下方示例配置 provider 和适配器。

Kingbase provider 和 SQL 方言支持已包含在适配发行版的配套组件中：CLI 和引擎根据 schema 中的 `kingbase-mysql` 或 `kingbase-oracle` 选择对应连接器及方言；应用导入 `PrismaKbMysql` 或 `PrismaKbOracle`，将适配器通过 `new PrismaClient({ adapter })` 传入客户端。内部依赖随 npm 安装，原生 Schema Engine 按下方说明下载，用户无需手工注册方言或修改框架源码。

| 数据库模式      | Prisma provider   | 驱动适配器       | 适配验证环境    |
| --------------- | ----------------- | ---------------- | --------------- |
| MySQL 兼容模式  | `kingbase-mysql`  | `PrismaKbMysql`  | R3 V009R003C018 |
| Oracle 兼容模式 | `kingbase-oracle` | `PrismaKbOracle` | R2 V009R002C016 |

两个适配器均使用 `kingbasedb` Node.js 驱动。查询由 Rust Query Compiler 编译，通过 TypeScript 查询解释器和驱动适配器执行；迁移和内省使用配套的原生 Schema Engine。

### 安装与初始化

应用运行环境要求 Node.js `^20.19 || ^22.12 || >=24.0`。以下命令不固定版本号，按 npm 的 `latest` 标签安装；CLI、Client 和适配器应使用相互兼容的适配发行版本。请在新项目目录中执行：

```sh
npm init -y
npm install --save-dev typescript tsx @types/node prisma-kb
npm install @prisma-kb/client @prisma-kb/adapter-kb dotenv
npx tsc --init
npm pkg set type=module
```

下面以 MySQL 兼容模式为例：

```sh
npx prisma-kb init --datasource-provider kingbase-mysql --output ../generated/prisma
```

在 `.env` 中设置连接地址，并将占位内容替换为实际连接信息：

```dotenv
DATABASE_URL="kingbase-mysql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA"
```

`prisma.config.ts` 负责 CLI 的数据库连接配置：

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma-kb/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
```

`prisma/schema.prisma` 中配置 provider 和模型，数据库 URL 放在配置文件中：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "kingbase-mysql"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

创建数据库对象并生成 Client：

```sh
npx prisma-kb migrate dev --name init
npx prisma-kb generate
```

在项目根目录创建 `index.ts`：

```ts
import 'dotenv/config'
import { PrismaKbMysql } from '@prisma-kb/adapter-kb'
import { PrismaClient } from './generated/prisma/client'

const adapter = new PrismaKbMysql(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

try {
  console.log(await prisma.user.findMany())
} finally {
  await prisma.$disconnect()
}
```

运行应用：

```sh
npx tsx index.ts
```

使用 Oracle 兼容模式时，初始化命令改为：

```sh
npx prisma-kb init --datasource-provider kingbase-oracle --output ../generated/prisma
```

同时使用 `provider = "kingbase-oracle"`、`kingbase-oracle://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA` 连接地址，以及 `PrismaKbOracle` 适配器：

```ts
import { PrismaKbOracle } from '@prisma-kb/adapter-kb'

const adapter = new PrismaKbOracle(process.env.DATABASE_URL!)
```

`PrismaKb` 和 `PrismaKbOptions` 分别保留为 `PrismaKbMysql` 和 `PrismaKbMysqlOptions` 的兼容别名。`db pull`、`migrate`、`generate` 和 `validate` 等 CLI 操作使用 `prisma-kb` 命令。

### 使用限制

Prisma Studio 不支持这两个 Kingbase provider。

适配器的其他限制及 BIT 位宽、无符号类型、日期时间处理等细节，见[适配器说明](./packages/adapter-kb/README.md)。

### 全文检索

两个模式的 `search` 和 `_relevance.search` 都接受金仓原生 `tsquery` 表达式。参数原样传递，不转换 MySQL Boolean Mode 表达式。

```ts
await prisma.user.findMany({
  where: { name: { search: 'John & !Smith' } },
  orderBy: { _relevance: { fields: ['name'], search: 'John | April', sort: 'desc' } },
})
```

使用 `&` 表示 AND、`|` 表示 OR、`!` 表示 NOT、`<->` 表示短语、`:*` 表示前缀匹配；无效表达式由数据库报错。MySQL 兼容模式使用固定的 `simple` 配置，与 Prisma 管理的 `@@fulltext` 索引保持一致。Oracle 兼容模式使用数据库默认配置，不提供 `@@fulltext`；两种模式的分词和相关性分数可能不同。

### 配套包与引擎

KB 发行包包括 `prisma-kb`、`@prisma-kb/client`、`@prisma-kb/adapter-kb`、`@prisma-kb/driver-adapter-utils`、`@prisma-kb/prisma-schema-wasm`、`@prisma-kb/query-compiler-wasm`、`@prisma-kb/engines` 和 `@prisma-kb/engines-version`。内部依赖由包依赖关系及 lockfile 确定，无需全部手动安装。

`@prisma-kb/engines` 默认从 [https://lifeng5210.github.io/prisma-engines-binaries](https://lifeng5210.github.io/prisma-engines-binaries) 下载对应修订的原生 Schema Engine；`PRISMA_ENGINES_MIRROR` 或 `PRISMA_BINARIES_MIRROR` 可指定其他镜像。引擎修订由 `@prisma-kb/engines-version` 决定。

Rust 引擎与 Wasm 构建说明见[金仓引擎仓库](https://github.com/lifeng5210/prisma-engines/tree/kingbase)。

### 源码构建

以下步骤用于适配开发和自行构建发行包。

```sh
git clone --branch kingbase https://github.com/lifeng5210/prisma-v7.git
cd prisma-v7
```

本仓库开发推荐 Node.js 24，使用根 `package.json` 固定的 pnpm 11.13.1。安装依赖并构建：

```sh
pnpm install
pnpm build
```

下方上游文档中的包名和命令保留原样，开发 KB 分支时以本节为准。

---

## What is Prisma?

Prisma ORM is a **next-generation ORM** that consists of these tools:

- [**Prisma Client**](https://www.prisma.io/docs/orm/prisma-client): Auto-generated and type-safe query builder for Node.js & TypeScript
- [**Prisma Migrate**](https://www.prisma.io/docs/orm/prisma-migrate): Declarative data modeling & migration system
- [**Prisma Studio**](https://github.com/prisma/studio): GUI to view and edit data in your database

Prisma Client can be used in _any_ Node.js or TypeScript backend application (including serverless applications and microservices). This can be a [REST API](https://www.prisma.io/docs/concepts/overview/prisma-in-your-stack/rest), a [GraphQL API](https://www.prisma.io/docs/concepts/overview/prisma-in-your-stack/graphql), a gRPC API, or anything else that needs a database.

**If you need a database to use with Prisma ORM, check out [Prisma Postgres](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres?utm_source=github&utm_medium=prisma-readme) or if you are looking for our MCP Server, head [here](https://github.com/prisma/mcp).**

## Getting started

### Quickstart (5min)

The fastest way to get started with Prisma is by following the quickstart guides. You can choose either of two databases:

- [Prisma Postgres](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres)
- [SQLite](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/sqlite)

### Bring your own database

If you already have your own database, you can follow these guides:

- [Add Prisma to an existing project](https://www.prisma.io/docs/getting-started/prisma-orm/add-to-existing-project/postgresql)
- [Set up a new project with Prisma from scratch](https://www.prisma.io/docs/getting-started/setup-prisma/start-from-scratch/relational-databases-typescript-postgresql)

## How Prisma ORM works

This section provides a high-level overview of how Prisma ORM works and its most important technical components. For a more thorough introduction, visit the [Prisma documentation](https://www.prisma.io/docs/).

### The Prisma schema

Every project that uses a tool from the Prisma toolkit starts with a [Prisma schema file](https://www.prisma.io/docs/orm/prisma-schema). The Prisma schema allows developers to define their _application models_ in an intuitive data modeling language and configure _generators_.

```prisma
// Data source
datasource db {
  provider = "postgresql"
}

// Generator
generator client {
  provider = "prisma-client"
  output   = "../generated"
}

// Data model
model Post {
  id        Int     @id @default(autoincrement())
  title     String
  content   String?
  published Boolean @default(false)
  author    User?   @relation(fields:  [authorId], references: [id])
  authorId  Int?
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}
```

In this schema, you configure three things:

- **Data source**: Specifies your database type and thus defines the features and data types you can use in the schema
- **Generator**: Indicates that you want to generate Prisma Client
- **Data model**: Defines your application models

### `prisma.config.ts`

Database connection details are defined via [`prisma.config.ts`](https://www.prisma.io/docs/orm/prisma-schema/prisma-config-reference).

```ts
import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: 'postgres://...',
  },
})
```

If you store the database connection string in `process.env`, an `env` function can help you access it in a type safe way and throw an error if it is missing at run time:

```ts
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

Prisma ORM does not load the `.env` files for you automatically. If you want to populate the environment variables from a `.env` file, consider using a package such as [`dotenv`](https://www.npmjs.com/package/dotenv) or [`@dotenvx/dotenvx`](https://www.npmjs.com/package/@dotenvx/dotenvx).

The configuration file may look like this in that case:

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

To start a local PostgreSQL development server without using Docker and without any configuration, run `prisma dev`:

```sh
npx prisma dev
```

Alternatively, spin up an instant Prisma Postgres® database in the cloud:

```sh
npx create-db --interactive
```

---

### The Prisma data model

On this page, the focus is on the data model. You can learn more about [Data sources](https://www.prisma.io/docs/orm/prisma-schema/overview/data-sources) and [Generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) on the respective docs pages.

#### Functions of Prisma models

The data model is a collection of [models](https://www.prisma.io/docs/orm/prisma-schema/data-model/models). A model has two major functions:

- Represent a table in the underlying database
- Provide the foundation for the queries in the Prisma Client API

#### Getting a data model

There are two major workflows for "getting" a data model into your Prisma schema:

- Generate the data model from [introspecting](https://www.prisma.io/docs/orm/prisma-schema/introspection) a database
- Manually writing the data model and mapping it to the database with [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)

Once the data model is defined, you can [generate Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client) which will expose CRUD and more queries for the defined models. If you're using TypeScript, you'll get full type-safety for all queries (even when only retrieving the subsets of a model's fields).

---

### Accessing your database with Prisma Client

#### Step 1: Install Prisma

First, install Prisma CLI as a development dependency and Prisma Client:

```
npm install prisma --save-dev
npm install @prisma/client
```

#### Step 2: Set up your Prisma schema

Ensure your Prisma schema includes a `generator` block with an `output` path specified:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated"
}

datasource db {
  provider = "postgresql"  // mysql (incl. mariadb), sqlite, sqlserver, mongodb or cockroachdb
}
```

#### Step 3: Configure Prisma Config

Configure the Prisma CLI using a `prisma.config.ts` file. This file configures Prisma CLI subcommands like `migrate` and `studio`. Create a `prisma.config.ts` file in your project root:

```ts
import { defineConfig, env } from 'prisma/config'

type Env = {
  DATABASE_URL: string
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
})
```

**Note**: Environment variables from `.env` files are not automatically loaded when using `prisma.config.ts`. You can use `dotenv` by importing `dotenv/config` at the top of your config file. For Bun, `.env` files are automatically loaded.

Learn more about [Prisma Config](https://www.prisma.io/docs/orm/reference/prisma-config-reference) and all available configuration options.

#### Step 4: Generate Prisma Client

Generate Prisma Client with the following command:

```
npx prisma generate
```

This command reads your Prisma schema and _generates_ the Prisma Client code in the location specified by the `output` path in your generator configuration.

After you change your data model, you'll need to manually re-generate Prisma Client to ensure the generated code gets updated:

```
npx prisma generate
```

Refer to the documentation for more information about [&#34;generating the Prisma client&#34;](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client).

#### Step 5: Use Prisma Client to send queries to your database

Once the Prisma Client is generated, you can import it in your code and send queries to your database.

##### Import and instantiate Prisma Client

You can import and instantiate Prisma Client from the output path specified in your generator configuration. When instantiating the Client, you need to provide a [driver adapter](https://www.prisma.io/docs/orm/core-concepts/supported-databases/database-drivers#how-to-use-driver-adapters) to its constructor. For example, when using PostgreSQL with a driver adapter:

```ts
import { PrismaClient } from './generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
```

To load environment variables, you can use `dotenv` by importing `dotenv/config`, use `tsx --env-file=.env`, `node --env-file=.env`, or Bun (which loads `.env` automatically).

Now you can start sending queries via the generated Prisma Client API, here are a few sample queries. Note that all Prisma Client queries return _plain old JavaScript objects_.

Learn more about the available operations in the [Prisma Client docs](https://www.prisma.io/docs/orm/prisma-client) or watch this [demo video](https://www.youtube.com/watch?v=LggrE5kJ75I&list=PLn2e1F9Rfr6k9PnR_figWOcSHgc_erDr5&index=4) (2 min).

##### Retrieve all `User` records from the database

```ts
const allUsers = await prisma.user.findMany()
```

##### Include the `posts` relation on each returned `User` object

```ts
const allUsers = await prisma.user.findMany({
  include: { posts: true },
})
```

##### Filter all `Post` records that contain `"prisma"`

```ts
const filteredPosts = await prisma.post.findMany({
  where: {
    OR: [{ title: { contains: 'prisma' } }, { content: { contains: 'prisma' } }],
  },
})
```

##### Create a new `User` and a new `Post` record in the same query

```ts
const user = await prisma.user.create({
  data: {
    name: 'Alice',
    email: 'alice@prisma.io',
    posts: {
      create: { title: 'Join us for Prisma Day 2021' },
    },
  },
})
```

##### Update an existing `Post` record

```ts
const post = await prisma.post.update({
  where: { id: 42 },
  data: { published: true },
})
```

#### Usage with TypeScript

Note that when using TypeScript, the result of this query will be _statically typed_ so that you can't accidentally access a property that doesn't exist (and any typos are caught at compile-time). Learn more about leveraging Prisma Client's generated types on the [Advanced usage of generated types](https://www.prisma.io/docs/orm/prisma-client/type-safety/operating-against-partial-structures-of-model-types) page in the docs.

## Community

Prisma has a large and supportive [community](https://www.prisma.io/community) of enthusiastic application developers. You can join us on [Discord](https://pris.ly/discord) and here on [GitHub](https://github.com/prisma/prisma/discussions).

## Badges

[![Made with Prisma](https://made-with.prisma.io/dark.svg)](https://prisma.io) [![Made with Prisma](https://made-with.prisma.io/indigo.svg)](https://prisma.io)

Built something awesome with Prisma? 🌟 Show it off with these [badges](https://github.com/prisma/presskit?tab=readme-ov-file#badges), perfect for your readme or website.

```
[![Made with Prisma](https://made-with.prisma.io/dark.svg)](https://prisma.io)
```

```
[![Made with Prisma](https://made-with.prisma.io/indigo.svg)](https://prisma.io)
```

## Security

If you have a security issue to report, please contact us at [security@prisma.io](mailto:security@prisma.io?subject=[GitHub]%20Prisma%202%20Security%20Report%20).

## Support

### Ask a question about Prisma

You can ask questions and initiate [discussions](https://github.com/prisma/prisma/discussions/) about Prisma-related topics in the `prisma` repository on GitHub.

👉 [**Ask a question**](https://github.com/prisma/prisma/discussions/new)

### Create a bug report for Prisma

If you see an error message or run into an issue, please make sure to create a bug report! You can find [best practices for creating bug reports](https://www.prisma.io/docs/guides/other/troubleshooting-orm/creating-bug-reports) (like including additional debugging output) in the docs.

👉 [**Create bug report**](https://pris.ly/prisma-prisma-bug-report)

### Submit a feature request

If Prisma currently doesn't have a certain feature, be sure to check out the [roadmap](https://www.prisma.io/docs/more/roadmap) to see if this is already planned for the future.

If the feature on the roadmap is linked to a GitHub issue, please make sure to leave a 👍 reaction on the issue and ideally a comment with your thoughts about the feature!

👉 [**Submit feature request**](https://github.com/prisma/prisma/issues/new?assignees=&labels=&template=feature_request.md&title=)

## Contributing

Refer to our [contribution guidelines](https://github.com/prisma/prisma/blob/v7/CONTRIBUTING.md) and [Code of Conduct for contributors](https://github.com/prisma/prisma/blob/v7/CODE_OF_CONDUCT.md).

## Tests Status

- Prisma Tests Status:
  [![Prisma Tests Status](https://github.com/prisma/prisma/actions/workflows/test.yml/badge.svg?branch=v7)](https://github.com/prisma/prisma/actions/workflows/test.yml?query=branch%3Av7)

Scheduled CI is currently disabled across the ORM repos; test workflows run on push, pull request, and manual `workflow_dispatch`. See the [Actions tab](https://github.com/prisma/prisma/actions) for recent runs.
