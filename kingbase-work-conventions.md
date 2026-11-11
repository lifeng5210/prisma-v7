# Prisma v7 工作约定

本文件只记录当前有效的仓库约定，整理日期为 2026-11-02。当前用户指令优先；确认行为时以本次源码、配置及实际验证为准。不要把历史审计中的 UNFIXED、COMPLETE 或测试计数直接当作当前状态。

`CLAUDE.md`、`GEMINI.md` 是本文件的符号链接，请直接编辑 `AGENTS.md`。只在长期规则或工作入口变化时更新本文件；实验经过、逐轮验收数字和原始日志索引写入普通文档。

## 用户约定与金仓边界

- 保留用户已有改动、未跟踪文档和相邻仓库的工作。未经授权，不提交、推送、发布，不调整驱动 pin、实例配置、服务、角色或权限。此前拒绝推送 rust-kingbase 的决定仍有效。
- 金仓适配默认只改自己的生产路径及必要的共享登记点，不顺带改原生 PostgreSQL/MySQL 的生产行为。Oracle 与 MySQL 两模式分别处理；协议相同不等于类型和 SQL 语义相同。
- Kingbase MySQL 后续适配遵循 [独立适配要求](../prisma-engines/record/kingbase-mysql-adaptation-requirements.md)：以 R3 为验收基线，先对照原生 MySQL，再验证 R3，必要时才替代；不要求同时兼容 R1。
- adapter-kb 的组织以 `packages/adapter-pg` 的职责布局为唯一参照。连接地址、PoolConfig、TLS、schema 处理留在 `kingbase-mysql.ts`、`kingbase-oracle.ts`，不要重新抽取 `connection-string.ts` 或参照其他 adapter 额外拆分文件。
- 不在框架额外模拟数据库表达式语义。MySQL 模式的 BLOB→BIT 使用普通 MODIFY 交数据库接受或拒绝；时间→数字使用原生 CAST，不恢复十进制前缀/饱和/sql_mode模拟、`to_char` 时间编码或按容量不足删列的补偿。
- 三种小 unsigned 原生类型基于 R3 接入，使用现有 INT4 编解码，R1 不支持；不恢复域、CHECK 或保护触发器模拟。UnsignedTinyInt 仅用于 Int，且不支持 autoincrement()；UnsignedSmallInt/UnsignedMediumInt 可使用原生自增。`UnsignedInt`/`sys.uint4`、`UnsignedBigInt`/`sys.uint8` 及默认 Boolean 保留。按 R3 新库验收，不维护旧 unsigned 模拟对象的专用识别和兼容路径；通用 Unsupported、外键反查和校验保留。
- 两模式全文输入统一为金仓原生 tsquery，例如 `John & !Smith`；参数原样绑定。MySQL visitor 保留 SQL 重写及 simple/GIN 配置，不恢复 Boolean Mode 解析器或 `PRISMA_MYSQL_BOOLEAN_QUERY` 标记。
- 两模式 JS `executeScript` 均保留签名并同步抛出 `Error('Not implemented yet')`，不能访问连接或执行 SQL。不要恢复脚本拆分器；普通事务、savepoint、MySQL 占位符扫描及 Rust 原生迁移脚本不受此限制。
- Kingbase MySQL 独立 SQL 数组绑定/结果不支持，已知数组 OID 仅用于拒绝。不要误删标量 JSON 数组编码或 `IN` 参数展开，也不要扩展为 PSL ScalarLists。底层驱动内部 catalog 数组与 escape hatch 不属于已删除接口。
- 不因 SQL 写法、类型范围或数据库能力不同就认定是应删的“额外功能”。SetDefault、宽字符串/Decimal、全文/TEXT/BLOB键、普通连接选项、原始 UUID/XML/网络值等应按已有功能适配范围判断。`pgbouncer` 未被要求删除，也没有真实代理端到端验收。
- Oracle 枚举替换后按普通外键元数据恢复约束，保留复合列、约束名和 onDelete/onUpdate；不额外补查并回放完整手工外键定义来保留 DEFERRABLE 等 PSL 无法表达的属性。普通共享序列和外部序列的归属判断保留。

## 仓库入口与架构

- 本仓是 pnpm/Turborepo monorepo。Node、pnpm 版本以根 `package.json` 的 `engines`、`packageManager` 为准；pnpm 配置在 `pnpm-workspace.yaml`，构建许可使用 `allowBuilds`。不要把 pnpm 11 的配置移回旧 package.json 字段。
- 根 `pnpm build`、`pnpm dev` 调用 Turbo；根 `pnpm test` 调用 `scripts/ci/publish.ts --test`。按实际包名筛选：CLI 为 `prisma-kb`，Client 为 `@prisma-kb/client`，金仓 adapter 为 `@prisma-kb/adapter-kb`；其他包查看各自 `package.json`。
- `packages/cli`：命令入口；`packages/migrate`：迁移与反查；`packages/config`：`PrismaConfig`；`packages/client`：Client runtime 和 functional 测试；两套生成器在 `packages/client-generator-js`、`packages/client-generator-ts`。
- `packages/driver-adapter-utils/src/types.ts` 定义 SQL adapter 合同；`packages/client-engine-runtime` 执行查询计划；`packages/query-plan-executor` 提供远端执行库。
- Client 路径为 `PrismaClient → ClientEngine → Query Compiler Wasm → executor → QueryInterpreter → JS driver adapter`。Rust PSL/QC 仍存在；Schema Engine 仍是原生工具。不要把 Client 不使用原生 Query Engine 误写成仓库没有任何 query-engine 测试或 Rust 数据库代码。
- PSL 不接受 datasource `url`、`directUrl`、`shadowDatabaseUrl`。连接信息由 `prisma.config.ts` 的 datasource 或 Client adapter 提供；不要恢复旧 `engine: 'classic' | 'js'` 配置。Prisma 7 不自动加载 `.env`；测试脚本中的 dotenv 是独立行为。
- Rust 仓库通常是同级 `../prisma-engines`，先确认实际路径。跨仓驱动版本以该仓 `Cargo.toml`/`Cargo.lock` 为准，不从历史笔记复制 pin。

## Adapter 和运行时合同

- OID/codec 参照 rust-kingbase 的 `postgres-types/src/mysql_type_gen.rs`、`oracle_type_gen.rs` 以及 engines 的 `quaint/src/connector/kingbase_mysql/native`、`kingbase_oracle/native`。这是 PostgreSQL 兼容协议 OID，不是 MySQL 字段代码。
- MySQL `BIT(1)` 与较宽 BIT 需同时按 OID/typmod决定声明类型和解码；默认 Boolean 应按布尔值往返，不能仅因 MySQL 引号语法而套用原生 MySQL 的所有标量结果语义。
- 两模式保留完整 JSON wire text，使用查询级 parser，不猜测 JSON 字符串内容，也不修改全局 parser。标量 JSON 的 JS 数组仍作为 JSON 编码。
- `kingbasedb` 池连接同时有驱动继承的 `connect()`/`end()` 和池提供的 `release()`，不能靠方法存在与否识别 pool。显式传递 pool；外部 pool 的选中 schema 设置必须落在真正执行查询的连接上，不强制修改 Oracle 连接时区。
- Kingbase MySQL INSERT 与 `SELECT LAST_INSERT_ID()` 补查必须使用同一连接。事务内复用事务 client，不重连或提前释放。显式非零自增 ID 使用编译器的 `PRISMA_MYSQL_AUTOINCREMENT_ID` 参数元数据；不要按 SQL/参数位置猜测，也不要用连接中残留的 ID 覆盖显式 ID。显式零按会话 `NO_AUTO_VALUE_ON_ZERO` 处理。
- 当前 `kingbasedb` 并未直接提供 `insertId`/`lastInsertId()`；adapter 自己的可选类型声明不证明驱动能力。自动插入 ID 当前由 adapter 补查取得，不应将此描述为 MySQL 驱动调用链。
- 两模式 `usePhantomQuery=false`：框架发 COMMIT/ROLLBACK，adapter 完成连接释放。变更前核对 transaction manager 合同，不重复提交或回滚。
- Oracle DATE 包含日期和时间；不要将其绑定为 date-only。Oracle R2 的 `TimestampLocalTz` 实际为 wire TIMESTAMP，JS/Rust 均绑定 UTC 时间分量并与读取规则一致；`TimestampTz` 保留时区语义，不通过强制会话 UTC 补偿。JS 无时区时间保留 wire text，避免 Node 本地夏令时转换。Oracle TINYINT 文本结果映射 Int32，ROWID 文本结果不能当作 Rust 二进制 codec 已实现。
- 共享查询计划由缓存复用，`DeepReadonly` 输入不可原地修改；需要调整时复制受影响节点，参照 `purifyQueryPlan`。关联路径按 selector/field 成对解释，不能按字符串值删除名为 `select`/`include` 的真实字段。
- 错误分层为 adapter `errors.ts` → `MappedError` → runtime user-facing error。raw 查询走 P2010；已识别数据库种类但未细分的错误保留原始 code/message，当前走 P2039。缺少 adapter 的初始化错误使用 P2038。新错误编号先检查源码，不能按旧文档猜测空位。
- MySQL P2002 要保留逻辑索引名；不要把物理索引名泄漏当作既定合同，也不要为了修正错误读取而破坏事务中的原始失败。
- 新 provider 需检查 Wasm provider 清单、CLI 资产复制、结果类型/lastInsertId、QPE factory、TypedSQL、Studio 和测试矩阵。

## 实施与构建

- 优先复用现有结构和 helper。新文件使用 kebab-case，避免新建无必要的 barrel；已有 index 约定按邻近代码保持一致。生产代码不要深导入其他 workspace 包的 `src/`，使用包入口。
- TypeScript 优先原生 `#private`；类型导入显式区分。注释解释原因和合同，避免复述实现。保持现有换行、fixture 原文、CRLF 和 Unicode，不用格式化掩盖测试差异。
- 新包同步 workspace、bundle paths 和合适的 `.github/workflows/test-template.yml` 任务；按任务需要验证相关包，不因文档举例就执行全仓构建。
- 修改 Client 构造选项时同步 runtime 校验、EngineConfig 和两套生成器，保留现有 union 顺序及推断行为。JSDoc hover 的 TypeScript 限制不能通过删除 constructor 泛型来规避。
- Wasm 构建在 engines 根执行 `make build-schema-wasm`、`make build-qc-wasm`，按改动选择必要模块。使用匹配版本的本地包/资产并核对包解析；不要为临时测试默认执行递归升级、改变依赖 pin 或覆盖用户 runtime。
- `@prisma/internals` 会打包 schema Wasm，仅在运行时替换依赖无法更新旧 bundle。涉及迁移/反查的测试还要让 `PRISMA_SCHEMA_ENGINE_BINARY` 指向匹配的原生引擎。
- 包构建会产出 CJS/ESM/d.ts；功能测试可能直接导入 `packages/client/runtime/client.js`，源码修改需确认实际加载的新产物。临时覆盖文件先备份，结束时按字节恢复。

## 测试与验证

常用入口（从本仓根运行，先确认相应测试环境）：

```sh
pnpm --filter @prisma-kb/adapter-kb test
pnpm --filter @prisma-kb/adapter-kb build
pnpm --filter prisma-kb test <pattern>
pnpm --filter @prisma-kb/client test:functional:code --adapter js_kb_mysql <pattern>
pnpm --filter @prisma-kb/client test:functional --adapter js_kb_oracle <pattern>
pnpm --filter @prisma/integration-tests test:kingbase-oracle
```

- 命令中的 `<pattern>` 是占位符，不原样执行。Client functional 参数放在 pattern 前，不额外加 `--`；入口和选项以 `packages/client/helpers/functional-test/run-tests.ts` 为准。
- 两套生成器与 code/types 入口分别说明；`--generate-only` 不等于运行 DB 测试，未运行 beforeAll 的产物不能证明完整类型覆盖。生成目录中的旧文件和 TS/JS 冲突需先辨别归属再处理。
- 金仓 functional 为 adapter 路径，使用 `TEST_FUNCTIONAL_KINGBASE_MYSQL_URI`/`TEST_FUNCTIONAL_KINGBASE_ORACLE_URI`，URL 按 harness 使用 `PRISMA_DB_NAME`。由金仓 helper 创建/清理选中测试 schema，不发送到通用 force-reset 路径。
- 普通 adapter DB 测试使用 `TEST_KINGBASE_MYSQL_URI`/`TEST_KINGBASE_ORACLE_URI`；不要与 functional 或 Rust 环境变量混用。缺少变量导致的 skip 不计实库覆盖。
- `_matrix.ts`、provider/adapter 注册、optOut、describeIf 与生成类型都影响覆盖。新增测试应接入既有功能矩阵并保留原生对照；只增加独立金仓测试不能证明共享入口已接入。
- 直接 SQL 的 MySQL 模式标识符使用反引号；便携 ID 用 `idForProvider`。Oracle NUMBER 的 TypedSQL结果可为 Decimal，即使模型字段是 Int/BigInt；不要因此弱化模型类型断言。
- 集成测试在 Schema Engine/Client 操作前关闭 setup 连接，afterEach重新连接清理本场景 schema；保留传给 `Database.afterEach` 的 Context。
- 临时 DB/schema 使用唯一自有名称，清理前确认归属；不按前缀批量删除未知对象，不更改实例/服务/许可配置来让测试通过。
- 正常验证不自动更新快照；确认正确预期后才使用对应测试框架的更新机制，检查 diff，再关闭更新重跑。对已有精确诊断不改成宽泛断言。
- 测试中不临时联网安装依赖；复用/链接仓库已固定依赖。CLI fixture 所需依赖需明确链接；二进制入口反复运行时优先已有 runner，避免每次额外启动包管理器。
- 只报告实际执行且去重的通过数。Cargo/Jest/Vitest 标题、内部早退、ignored、skip、重复、生成文件、手工探针各自说明；旧验收数不代表当前全项目全绿。
- 文档或其他低影响可逆修改按实际风险做静态校验，不为凑计数启动数据库或添加镜像测试。

## CLI、远端执行与工具

- CLI 连接配置来自 `PrismaConfigInternal.datasource`；SQLite 相对路径相对于配置文件。更新帮助文本时按实际命令参数核对，不保留已移除选项。
- `packages/cli/src/mcp/MCP.ts` 目前注册 `migrate-status`、`migrate-dev`、`Prisma-Studio`，没有 `migrate-reset`；不要按历史工具列表调用不存在的工具。
- 保留 `packages/migrate/src/utils/ai-safety.ts` 的检测和用户同意机制，不绕过或替换为另一套检测，不新增破坏性 MCP 工具。
- `packages/query-plan-executor` 是内部库，自托管 host需 HTTP listener、OpenTelemetry上下文和 active logger；不能假定托管 Accelerate 理解 fork-only 金仓 provider。示例 host 的通过不等于生产鉴权、HTTPS、缓存、限流、多租户或全球部署已验收。
- Studio 是否可编辑先核实表/列可写性；服务入口和静态资源使用 `packages/cli/src/Studio.ts`、`studio-server.ts` 的现有约定。

## 未决事项与持久记录

- 原生 MySQL 路径同样复现的问题按用户要求不纳入金仓待修：已确认包括映射枚举 DDL 引号、一对一 `relationMode=prisma` deleteMany cardinality，以及时间精度提前校验。保留对照记录，不单独修金仓或顺带改共享实现。
- 仍待核对：人工共享普通序列的 ACL/comment/view/function 等额外属性保护；DMMF/版本基线。普通共享序列的基本保护已复验正常，不能据此宣称所有附加属性均已验收。Oracle 取消 identity 直接执行 DROP IDENTITY，由数据库校验依赖；不恢复为共享 identity 重建序列、复制计数或回绑默认值的额外适配，其权限/注释保留不再列为待实现功能。
- Client/CLI/Rust 共享测试全量接入盘点仍有待办，包括 Rust QE/QC 金仓 tag/provider/adapter/executor 桥接、query introspection/CLI 建库入口和公共矩阵/guard。具体范围按持久回归文档逐项核对，不能靠一轮 headline 数字认定完成。
- 正式 release 引擎、Wasm/包发布、全项目全部组合不因历史聚焦回归而自动验收。
- 旧 `/tmp` 日志及已归档/移除的 JSON 可能不存在；引用失效不等于重新验证通过，更不能补造原始记录。
