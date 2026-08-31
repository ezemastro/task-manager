import { useState, useEffect } from "react";
import {
  Container,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Stack,
} from "@mui/material";
import {
  apiClient,
  type AdminAccount,
  type AuthUser,
} from "../services/apiClient";

export default function RegisteredAccountsView() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const [me, accountsList] = await Promise.all([
          apiClient.getMe(),
          apiClient.getAdminAccounts(),
        ]);
        setUser(me);
        setAccounts(accountsList);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al cargar las cuentas registradas";
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: "center" }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando cuentas...
        </Typography>
      </Container>
    );
  }

  // Guardia en línea: un usuario sin el flag isSuperAdmin no ve datos.
  if (user && !user.isSuperAdmin) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          No tienes permisos para ver las cuentas registradas.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          mb: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h4" component="h1">
          Usuarios Registrados
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Cuenta</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Organizaciones</TableCell>
              <TableCell>Rol(es)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.length === 0 && !error ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No hay cuentas registradas
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => {
                const roles = Array.from(
                  new Set(
                    account.organizations
                      .map((org) => org.role)
                      .filter((role): role is string => Boolean(role)),
                  ),
                );
                return (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Typography variant="body1" fontWeight="medium">
                        {account.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{account.email}</TableCell>
                    <TableCell>
                      {account.organizations.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Sin organizaciones
                        </Typography>
                      ) : (
                        <Stack spacing={0.5}>
                          {account.organizations.map((org) => (
                            <Box key={org.organizationId}>
                              <Typography variant="body2">
                                {org.organizationName}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {org.role}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell>
                      {roles.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Sin rol
                        </Typography>
                      ) : (
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          {roles.map((role) => (
                            <Chip
                              key={role}
                              label={role}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
