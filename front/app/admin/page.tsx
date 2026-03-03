"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  getStores,
  getStoreUsers,
  createStore,
  updateStore,
  deleteStore,
  createStoreUser,
  updateUser,
  deleteUser,
  type Store,
  type StoreUser,
} from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeDialog, setStoreDialog] = useState<"new" | Store | null>(null);
  const [userDialog, setUserDialog] = useState<"new" | StoreUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "store" | "user"; id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN") {
      router.replace("/caixa");
      return;
    }
    getStores()
      .then(setStores)
      .catch(() => toast.error("Falha ao carregar lojas"))
      .finally(() => setLoading(false));
  }, [user?.role, router]);

  useEffect(() => {
    if (!selectedStoreId) {
      setStoreUsers([]);
      return;
    }
    getStoreUsers(selectedStoreId)
      .then(setStoreUsers)
      .catch(() => toast.error("Falha ao carregar usuários"));
  }, [selectedStoreId]);

  async function handleSaveStore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("storeName") as HTMLInputElement).value.trim();
    const slug = (form.elements.namedItem("storeSlug") as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || !slug) return;
    setSubmitting(true);
    try {
      if (storeDialog === "new") {
        const created = await createStore(name, slug);
        setStores((prev) => [...prev, created]);
        toast.success("Loja criada");
      } else if (storeDialog && "id" in storeDialog) {
        await updateStore(storeDialog.id, { name, slug });
        setStores((prev) => prev.map((s) => (s.id === storeDialog.id ? { ...s, name, slug } : s)));
        toast.success("Loja atualizada");
      }
      setStoreDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("userName") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("userEmail") as HTMLInputElement).value.trim().toLowerCase();
    const password = (form.elements.namedItem("userPassword") as HTMLInputElement).value;
    if (!selectedStoreId) return;
    setSubmitting(true);
    try {
      if (userDialog === "new") {
        if (!password || password.length < 6) {
          toast.error("Senha com no mínimo 6 caracteres");
          setSubmitting(false);
          return;
        }
        const created = await createStoreUser(selectedStoreId, { email, password, name });
        setStoreUsers((prev) => [...prev, created]);
        toast.success("Usuário criado");
      } else if (userDialog && "id" in userDialog) {
        await updateUser(userDialog.id, password ? { name, password } : { name });
        setStoreUsers((prev) =>
          prev.map((u) => (u.id === userDialog.id ? { ...u, name } : u))
        );
        toast.success("Usuário atualizado");
      }
      setUserDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      if (deleteTarget.type === "store") {
        await deleteStore(deleteTarget.id);
        setStores((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        if (selectedStoreId === deleteTarget.id) setSelectedStoreId(null);
        toast.success("Loja excluída");
      } else {
        await deleteUser(deleteTarget.id);
        setStoreUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        toast.success("Usuário excluído");
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  if (user?.role !== "SUPER_ADMIN") return null;

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin - Lojas e usuários</h1>
        <p className="text-muted-foreground text-sm">
          Cadastre lojas e usuários de acesso por loja.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lojas</CardTitle>
            <CardDescription>Lista de lojas cadastradas</CardDescription>
          </div>
          <Button onClick={() => setStoreDialog("new")}>
            <Plus className="size-4 mr-2" />
            Nova loja
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow
                    key={s.id}
                    className={selectedStoreId === s.id ? "bg-muted/50" : ""}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-left hover:underline"
                        onClick={() => setSelectedStoreId(s.id)}
                      >
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell>{s.slug}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setStoreDialog(s)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTarget({
                              type: "store",
                              id: s.id,
                              name: s.name,
                            })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedStoreId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <StoreIcon className="size-5" />
                Usuários da loja
              </CardTitle>
              <CardDescription>
                {stores.find((s) => s.id === selectedStoreId)?.name}
              </CardDescription>
            </div>
            <Button onClick={() => setUserDialog("new")}>
              <Plus className="size-4 mr-2" />
              Novo usuário
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUserDialog(u)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTarget({
                              type: "user",
                              id: u.id,
                              name: u.name,
                            })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={storeDialog !== null} onOpenChange={() => setStoreDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {storeDialog === "new" ? "Nova loja" : "Editar loja"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveStore}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="storeName">Nome</Label>
                <Input
                  id="storeName"
                  name="storeName"
                  defaultValue={storeDialog && storeDialog !== "new" && "name" in storeDialog ? storeDialog.name : ""}
                  placeholder="Ex: Loja Centro"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storeSlug">Slug</Label>
                <Input
                  id="storeSlug"
                  name="storeSlug"
                  defaultValue={storeDialog && storeDialog !== "new" && "slug" in storeDialog ? storeDialog.slug : ""}
                  placeholder="Ex: loja-centro"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStoreDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialog !== null} onOpenChange={() => setUserDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {userDialog === "new" ? "Novo usuário" : "Editar usuário"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveUser}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="userName">Nome</Label>
                <Input
                  id="userName"
                  name="userName"
                  defaultValue={userDialog && userDialog !== "new" && "name" in userDialog ? userDialog.name : ""}
                  placeholder="Nome do usuário"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userEmail">E-mail</Label>
                <Input
                  id="userEmail"
                  name="userEmail"
                  type="email"
                  defaultValue={userDialog && userDialog !== "new" && "email" in userDialog ? userDialog.email : ""}
                  placeholder="email@loja.com"
                  required
                  disabled={userDialog !== "new"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userPassword">
                  Senha {userDialog !== "new" && "(deixe em branco para não alterar)"}
                </Label>
                <Input
                  id="userPassword"
                  name="userPassword"
                  type="password"
                  placeholder={userDialog === "new" ? "Mín. 6 caracteres" : "Nova senha (opcional)"}
                  required={userDialog === "new"}
                  minLength={userDialog === "new" ? 6 : undefined}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUserDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.type === "store" ? "loja" : "usuário"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "store"
                ? `A loja "${deleteTarget.name}" e todos os dados associados serão excluídos.`
                : `O usuário "${deleteTarget?.name}" será excluído.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
