import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";

import type {
  DeployHookActivity,
  DeployHookSettings,
  DeployHookTestResult,
  UpdateDeployHookInput,
} from "@/shared/api-types";

export const deployHookKeys = {
  all: ["admin-deploy-hook"] as const,
  activity: ["admin-deploy-hook", "activity"] as const,
};

export const deployHookQueryOptions = queryOptions({
  queryKey: deployHookKeys.all,
  queryFn: () => api.get<DeployHookSettings>("/api/admin/deploy-hook"),
  staleTime: 30_000,
});

export const deployHookActivityQueryOptions = queryOptions({
  queryKey: deployHookKeys.activity,
  queryFn: () => api.get<DeployHookActivity>("/api/admin/deploy-hook/deliveries"),
  staleTime: 10_000,
});

export function updateDeployHook(body: UpdateDeployHookInput): Promise<DeployHookSettings> {
  return api.patch<DeployHookSettings>("/api/admin/deploy-hook", body);
}

export function testDeployHook(): Promise<DeployHookTestResult> {
  return api.post<DeployHookTestResult>("/api/admin/deploy-hook/test");
}
