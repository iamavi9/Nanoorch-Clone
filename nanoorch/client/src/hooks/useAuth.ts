import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

export type AuthUser = {
  id: string;
  username: string | null;
  name: string | null;
  role: "admin" | "member";
  csrfToken?: string;
  workspaceAdminIds: string[];
};

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = user?.role === "admin";
  const isMember = user?.role === "member";

  function isWorkspaceAdmin(workspaceId: string): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    return (user.workspaceAdminIds ?? []).includes(workspaceId);
  }

  const isAnyWorkspaceAdmin = (user?.workspaceAdminIds?.length ?? 0) > 0;

  return { user: user ?? null, isLoading, isAdmin, isMember, isWorkspaceAdmin, isAnyWorkspaceAdmin };
}

export function useLogout() {
  const [, navigate] = useLocation();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });
}
