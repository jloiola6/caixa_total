"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      if (user.role === "SUPER_ADMIN") router.replace("/admin");
      else router.replace("/caixa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center">
          <Image
            src="/caixa-total-logo.png"
            alt="Logo Caixa Total"
            width={768}
            height={512}
            className="h-20 w-auto rounded-lg"
            priority
          />
        </div>
        <CardTitle className="text-2xl">CaixaTotal</CardTitle>
        <CardDescription>Entre com seu e-mail e senha</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Link
            href="/esqueci-senha"
            className="text-sm text-muted-foreground hover:text-primary block text-center"
          >
            Esqueci minha senha
          </Link>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
