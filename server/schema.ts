import { sql } from "drizzle-orm";
import { pgTable, text, integer, real, jsonb, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  userId: text("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  active: integer("active").notNull().default(1),
});

export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  pineScript: text("pine_script").notNull(),
  parsedInputs: jsonb("parsed_inputs").notNull(),
  groups: jsonb("groups"),
  strategySettings: jsonb("strategy_settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const optimizationRuns = pgTable("optimization_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  strategyId: integer("strategy_id").notNull(),
  tickers: jsonb("tickers").notNull(),
  timeframes: jsonb("timeframes").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  randomSamples: integer("random_samples").notNull(),
  topK: integer("top_k").notNull(),
  refinementsPerSeed: integer("refinements_per_seed").notNull(),
  minTrades: integer("min_trades").notNull(),
  maxDrawdownCap: real("max_drawdown_cap").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("running"),
  totalConfigsTested: integer("total_configs_tested"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const optimizationResults = pgTable("optimization_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  ticker: text("ticker").notNull(),
  timeframe: text("timeframe").notNull(),
  rank: integer("rank").notNull(),
  netProfitPercent: real("net_profit_percent").notNull(),
  winRatePercent: real("win_rate_percent").notNull(),
  maxDrawdownPercent: real("max_drawdown_percent").notNull(),
  profitFactor: real("profit_factor").notNull(),
  totalTrades: integer("total_trades").notNull(),
  params: jsonb("params").notNull(),
  trades: jsonb("trades"),
  equityCurve: jsonb("equity_curve"),
});

export const insertStrategySchema = createInsertSchema(strategies).omit({ id: true, createdAt: true });
export const insertRunSchema = createInsertSchema(optimizationRuns).omit({ id: true, createdAt: true, completedAt: true });
export const insertResultSchema = createInsertSchema(optimizationResults).omit({ id: true });

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type OptimizationRun = typeof optimizationRuns.$inferSelect;
export type InsertRun = z.infer<typeof insertRunSchema>;
export type OptResult = typeof optimizationResults.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;
