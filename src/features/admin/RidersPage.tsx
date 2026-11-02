import { Fragment, useState } from 'react';
import type { FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD, formatShortDate } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const MIN_PASSWORD_LENGTH = 8;
const PAGE_SIZE = 20;

const roleLabel: Record<string, string> = {
  rider: 'Livreur',
  supervisor: 'Superviseur',
};

type TeamRole = 'rider' | 'supervisor';

export default function RidersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const members = useQuery(api.users.listTeamMembers, { includeArchived: showArchived });
  const unlinkedRiders = useQuery(api.users.getUnlinkedRiders, {});
  const createTeamMember = useAction(api.users.createTeamMember);
  const setUserActive = useMutation(api.users.setUserActive);
  const bulkSetUserActive = useMutation(api.users.bulkSetUserActive);
  const updateUserRole = useMutation(api.users.updateUserRole);
  const archiveTeamMember = useMutation(api.users.archiveTeamMember);
  const restoreTeamMember = useMutation(api.users.restoreTeamMember);
  const recordRiderLoss = useMutation(api.debt.recordRiderLoss);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('rider');
  const [pending, setPending] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<Id<'users'>>>(new Set());
  const [busy, setBusy] = useState(false);

  const [unlinkedSearch, setUnlinkedSearch] = useState('');
  const [unlinkedVisibleCount, setUnlinkedVisibleCount] = useState(PAGE_SIZE);

  const [lossUserId, setLossUserId] = useState<Id<'users'> | null>(null);
  const [lossAmount, setLossAmount] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [lossDate, setLossDate] = useState(todayDateInputValue());
  const [lossPending, setLossPending] = useState(false);

  const [linkRiderId, setLinkRiderId] = useState<Id<'riders'> | null>(null);
  const [linkRiderName, setLinkRiderName] = useState('');
  const [linkDisplayName, setLinkDisplayName] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkPending, setLinkPending] = useState(false);

  if (members === undefined || unlinkedRiders === undefined) return <LoadingSpinner />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      toast.error('Le nom est obligatoire.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Saisissez une adresse e-mail valide.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }

    setPending(true);
    try {
      await createTeamMember({
        displayName: trimmedName,
        email: trimmedEmail,
        password,
        role,
      });
      toast.success(
        `Compte ${roleLabel[role].toLowerCase()} « ${trimmedName} » créé.`
      );
      setDisplayName('');
      setEmail('');
      setPassword('');
      setRole('rider');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setPending(false);
    }
  };

  const openLinkForm = (rider: (typeof unlinkedRiders)[number]) => {
    setLinkRiderId(rider._id);
    setLinkRiderName(rider.canonicalName);
    setLinkDisplayName(rider.canonicalName);
    setLinkEmail('');
    setLinkPassword('');
  };

  const closeLinkForm = () => {
    setLinkRiderId(null);
    setLinkRiderName('');
    setLinkDisplayName('');
    setLinkEmail('');
    setLinkPassword('');
  };

  const handleLinkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!linkRiderId) return;

    const trimmedName = linkDisplayName.trim();
    const trimmedEmail = linkEmail.trim();

    if (!trimmedName) {
      toast.error('Le nom est obligatoire.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Saisissez une adresse e-mail valide.');
      return;
    }
    if (linkPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }

    setLinkPending(true);
    try {
      await createTeamMember({
        displayName: trimmedName,
        email: trimmedEmail,
        password: linkPassword,
        role: 'rider',
        riderId: linkRiderId,
      });
      toast.success(`Compte de ${trimmedName} créé et lié au livreur Excel.`);
      closeLinkForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLinkPending(false);
    }
  };

  const handleToggleActive = async (member: (typeof members)[number]) => {
    const action = member.isActive ? 'désactiver' : 'réactiver';
    if (!window.confirm(`Êtes-vous sûr de vouloir ${action} le compte de ${member.displayName} ?`)) return;

    try {
      await setUserActive({ userId: member.userId, isActive: !member.isActive });
      toast.success(`Compte de ${member.displayName} ${member.isActive ? 'désactivé' : 'réactivé'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  };

  const handleRoleChange = async (member: (typeof members)[number], nextRole: TeamRole) => {
    if (nextRole === member.role) return;
    try {
      await updateUserRole({ userId: member.userId, role: nextRole });
      toast.success(`Rôle de ${member.displayName} mis à jour : ${roleLabel[nextRole]}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  };

  const handleArchive = async (member: (typeof members)[number]) => {
    const confirmed = window.confirm(
      `Archiver le compte de ${member.displayName} ? Le compte ne pourra plus se connecter, mais son historique financier est conservé.`
    );
    if (!confirmed) return;

    try {
      await archiveTeamMember({ userId: member.userId });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(member.userId);
        return next;
      });
      toast.success(`Compte de ${member.displayName} archivé.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  };

  const handleRestore = async (member: (typeof members)[number]) => {
    try {
      await restoreTeamMember({ userId: member.userId });
      toast.success(
        `Compte de ${member.displayName} restauré (inactif). Réactivez-le pour autoriser la connexion.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  };

  const closeLossForm = () => {
    setLossUserId(null);
    setLossAmount('');
    setLossReason('');
    setLossDate(todayDateInputValue());
  };

  const toggleLossForm = (member: (typeof members)[number]) => {
    if (lossUserId === member.userId) {
      closeLossForm();
      return;
    }
    setLossUserId(member.userId);
    setLossAmount('');
    setLossReason('');
    setLossDate(todayDateInputValue());
  };

  const handleLossSubmit = async (
    event: FormEvent<HTMLFormElement>,
    member: (typeof members)[number]
  ) => {
    event.preventDefault();

    const amountCentimes = parseAmountToCentimes(lossAmount);
    if (amountCentimes === null) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    const reason = lossReason.trim();
    if (!reason) {
      toast.error('Indiquez le motif de la perte.');
      return;
    }

    const sourceReportDate = dateInputToTimestamp(lossDate);
    if (sourceReportDate === null) {
      toast.error('Sélectionnez une date de rapport valide.');
      return;
    }

    setLossPending(true);
    try {
      await recordRiderLoss({
        riderUserId: member.userId,
        amount: amountCentimes,
        reason,
        sourceReportDate,
      });
      toast.success(
        `Perte de ${formatMAD(amountCentimes)} enregistrée au nom de ${member.displayName}.`
      );
      closeLossForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLossPending(false);
    }
  };

  const toggleSelected = (userId: Id<'users'>) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleBulkActive = async (isActive: boolean) => {
    const userIds = Array.from(selectedIds);
    if (userIds.length === 0) {
      toast.error('Sélectionnez au moins un membre.');
      return;
    }
    if (!isActive && !window.confirm(`Désactiver ${userIds.length} membre(s) sélectionné(s) ?`)) {
      return;
    }

    setBusy(true);
    try {
      const result = await bulkSetUserActive({ userIds, isActive });
      toast.success(
        `${result.updated} compte(s) ${isActive ? 'réactivé(s)' : 'désactivé(s)'}.`
      );
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    if (!query) return true;
    return (
      member.displayName.toLowerCase().includes(query) ||
      (member.email ?? '').toLowerCase().includes(query)
    );
  });

  const displayed = filteredMembers.slice(0, visibleCount);
  const hasMore = filteredMembers.length > visibleCount;

  const selectableVisible = displayed.filter((member) => !member.isArchived);
  const allVisibleSelected =
    selectableVisible.length > 0 &&
    selectableVisible.every((member) => selectedIds.has(member.userId));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const member of selectableVisible) next.delete(member.userId);
      } else {
        for (const member of selectableVisible) next.add(member.userId);
      }
      return next;
    });
  };

  const activeCount = members.filter((m) => m.isActive && !m.isArchived).length;

  const unlinkedQuery = unlinkedSearch.trim().toLocaleLowerCase('fr');
  const filteredUnlinkedRiders = unlinkedRiders.filter((rider) => {
    if (!unlinkedQuery) return true;
    return (
      rider.canonicalName.toLocaleLowerCase('fr').includes(unlinkedQuery) ||
      rider.aliases.join(' ').toLocaleLowerCase('fr').includes(unlinkedQuery)
    );
  });
  const displayedUnlinkedRiders = filteredUnlinkedRiders.slice(0, unlinkedVisibleCount);
  const hasMoreUnlinked = filteredUnlinkedRiders.length > unlinkedVisibleCount;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Équipe</h1>
          <p className="page-sub">
            Les comptes sont créés par l’administration. L’inscription publique est
            désactivée dès qu’un administrateur existe.
          </p>
        </div>
        <span className="page-tag">
          {activeCount} actif(s) / {members.length}
        </span>
      </header>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Créer un compte</h2>
            <p className="panel-sub">
              Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.
            </p>
          </div>
        </header>

        <form className="rider-admin-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Nom complet</span>
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Rida Alaoui"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="membre@bringo.ma"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Mot de passe</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </label>

          <label className="field">
            <span className="field-label">Rôle</span>
            <select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as TeamRole)}
            >
              <option value="rider">Livreur</option>
              <option value="supervisor">Superviseur</option>
            </select>
          </label>

          <button type="submit" className="button button-primary" disabled={pending}>
            {pending ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Membres de l’équipe</h2>
            <p className="panel-sub">
              Un compte désactivé ne peut plus se connecter.
            </p>
          </div>
          <div className="panel-head-actions">
            <label className="checkline">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                  setVisibleCount(PAGE_SIZE);
                  setSelectedIds(new Set());
                }}
              />
              <span>Afficher les archivés</span>
            </label>
            <span className="panel-count">{members.length} membre(s)</span>
          </div>
        </header>

        {members.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun membre enregistré</p>
            <p className="empty-text">
              Créez le premier compte avec le formulaire ci-dessus.
            </p>
          </div>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Rechercher par nom ou e-mail…"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                  setSelectedIds(new Set());
                }}
              />
            </div>

            {filteredMembers.length === 0 ? (
              <div className="empty">
                <p className="empty-title">Aucun résultat</p>
                <p className="empty-text">Essayez un autre terme de recherche.</p>
              </div>
            ) : (
              <>
                {selectedIds.size > 0 ? (
                  <div className="bulk-bar">
                    <span className="bulk-count">{selectedIds.size} sélectionné(s)</span>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="button-ghost"
                        disabled={busy}
                        onClick={() => handleBulkActive(true)}
                      >
                        Réactiver
                      </button>
                      <button
                        type="button"
                        className="button-ghost is-danger"
                        disabled={busy}
                        onClick={() => handleBulkActive(false)}
                      >
                        Désactiver
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        disabled={busy}
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col" className="table-select">
                          <input
                            type="checkbox"
                            aria-label="Tout sélectionner"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            disabled={selectableVisible.length === 0}
                          />
                        </th>
                        <th scope="col">Nom</th>
                        <th scope="col">E-mail</th>
                        <th scope="col">Rôle</th>
                        <th scope="col">Dette</th>
                        <th scope="col">Créé le</th>
                        <th scope="col">État</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((member) => (
                        <Fragment key={member.userId}>
                          <tr>
                            <td className="table-select">
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner ${member.displayName}`}
                                checked={selectedIds.has(member.userId)}
                                disabled={member.isArchived}
                                onChange={() => toggleSelected(member.userId)}
                              />
                            </td>
                            <td>
                              {member.role === 'rider' ? (
                                <Link
                                  className="rider-profile-link"
                                  to={`/admin/riders/${member.userId}`}
                                >
                                  {member.displayName}
                                </Link>
                              ) : (
                                member.displayName
                              )}
                            </td>
                            <td className="table-muted">{member.email ?? '—'}</td>
                            <td>
                              {member.isArchived ? (
                                <span
                                  className={`badge ${
                                    member.role === 'supervisor' ? 'badge-ok' : 'badge-pending'
                                  }`}
                                >
                                  <span className="badge-dot" aria-hidden="true" />
                                  {roleLabel[member.role] ?? member.role}
                                </span>
                              ) : (
                                <select
                                  aria-label={`Rôle de ${member.displayName}`}
                                  value={member.role}
                                  onChange={(event) =>
                                    handleRoleChange(member, event.target.value as TeamRole)
                                  }
                                >
                                  <option value="rider">Livreur</option>
                                  <option value="supervisor">Superviseur</option>
                                </select>
                              )}
                            </td>
                            <td
                              className={`numeric ${
                                member.debtBalance > 0 ? 'is-due' : 'table-muted'
                              }`}
                            >
                              {member.debtBalance > 0 ? formatMAD(member.debtBalance) : '—'}
                            </td>
                            <td className="table-muted">{formatShortDate(member.createdAt)}</td>
                            <td>
                              {member.isArchived ? (
                                <span className="badge badge-neutral">
                                  <span className="badge-dot" aria-hidden="true" />
                                  Archivé
                                </span>
                              ) : (
                                <span
                                  className={`badge ${
                                    member.isActive ? 'badge-ok' : 'badge-neutral'
                                  }`}
                                >
                                  <span className="badge-dot" aria-hidden="true" />
                                  {member.isActive ? 'Actif' : 'Inactif'}
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="table-actions">
                                {member.isArchived ? (
                                  <button
                                    type="button"
                                    className="button-ghost"
                                    onClick={() => handleRestore(member)}
                                  >
                                    Restaurer
                                  </button>
                                ) : (
                                  <>
                                    {member.role === 'rider' ? (
                                      <button
                                        type="button"
                                        className="button-ghost"
                                        aria-expanded={lossUserId === member.userId}
                                        onClick={() => toggleLossForm(member)}
                                      >
                                        Consigner une perte
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="button-ghost"
                                      onClick={() => handleToggleActive(member)}
                                    >
                                      {member.isActive ? 'Désactiver' : 'Réactiver'}
                                    </button>
                                    <button
                                      type="button"
                                      className="button-ghost is-danger"
                                      onClick={() => handleArchive(member)}
                                    >
                                      Archiver
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {lossUserId === member.userId ? (
                            <tr className="rider-loss-row">
                              <td colSpan={8}>
                                <form
                                  className="rider-loss-form"
                                  onSubmit={(event) => handleLossSubmit(event, member)}
                                  noValidate
                                >
                                  <div className="rider-loss-head">
                                    <p className="rider-loss-title">
                                      Consigner une perte — {member.displayName}
                                    </p>
                                    <p className="rider-loss-text">
                                      Le montant sera ajouté à la dette du livreur et
                                      journalisé dans l’audit.
                                    </p>
                                  </div>

                                  <label className="field">
                                    <span className="field-label">Montant perdu (MAD)</span>
                                    <input
                                      type="text"
                                      name="lossAmount"
                                      value={lossAmount}
                                      onChange={(event) => setLossAmount(event.target.value)}
                                      placeholder="0,00"
                                      inputMode="decimal"
                                      autoComplete="off"
                                    />
                                  </label>

                                  <label className="field">
                                    <span className="field-label">Motif</span>
                                    <input
                                      type="text"
                                      name="lossReason"
                                      value={lossReason}
                                      onChange={(event) => setLossReason(event.target.value)}
                                      placeholder="Ex. : espèces perdues"
                                      autoComplete="off"
                                    />
                                  </label>

                                  <label className="field">
                                    <span className="field-label">Date du rapport</span>
                                    <input
                                      type="date"
                                      name="lossDate"
                                      value={lossDate}
                                      onChange={(event) => setLossDate(event.target.value)}
                                    />
                                  </label>

                                  <div className="rider-loss-actions">
                                    <button
                                      type="submit"
                                      className="button button-primary"
                                      disabled={lossPending}
                                    >
                                      {lossPending ? 'Enregistrement…' : 'Enregistrer la perte'}
                                    </button>
                                    <button
                                      type="button"
                                      className="button-ghost"
                                      disabled={lossPending}
                                      onClick={closeLossForm}
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hasMore ? (
                  <div className="load-more">
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                    >
                      Charger plus ({filteredMembers.length - visibleCount} restant(s))
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Livreurs Excel non liés</h2>
            <p className="panel-sub">
              Livreurs importés depuis le fichier Excel qui n’ont pas encore de compte.
              Créez un compte pour les lier à leur profil.
            </p>
          </div>
          <span className="panel-count">
            {unlinkedQuery
              ? `${filteredUnlinkedRiders.length} / ${unlinkedRiders.length} livreur(s)`
              : `${unlinkedRiders.length} livreur(s)`}
          </span>
        </header>

        {unlinkedRiders.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Tous les livreurs sont liés</p>
            <p className="empty-text">Chaque livreur importé depuis Excel dispose d’un compte.</p>
          </div>
        ) : (
          <>
            <label className="field market-search">
              <span className="field-label">Rechercher</span>
              <input
                type="search"
                value={unlinkedSearch}
                placeholder="Nom ou alias du livreur…"
                onChange={(event) => {
                  setUnlinkedSearch(event.target.value);
                  setUnlinkedVisibleCount(PAGE_SIZE);
                }}
              />
            </label>

            {filteredUnlinkedRiders.length === 0 ? (
              <div className="empty">
                <p className="empty-title">Aucun résultat</p>
                <p className="empty-text">Essayez un autre nom ou alias.</p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Livreur</th>
                        <th scope="col">Alias</th>
                        <th scope="col">État Excel</th>
                        <th scope="col">Ajouté le</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedUnlinkedRiders.map((rider) => (
                        <tr key={rider._id}>
                          <td>{rider.canonicalName}</td>
                          <td className="table-muted">
                            {rider.aliases.length > 0 ? rider.aliases.join(', ') : '—'}
                          </td>
                          <td>
                            <span
                              className={`badge ${rider.isActive ? 'badge-ok' : 'badge-neutral'}`}
                            >
                              <span className="badge-dot" aria-hidden="true" />
                              {rider.isActive ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          <td className="table-muted">{formatShortDate(rider.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="button-ghost"
                                onClick={() => openLinkForm(rider)}
                              >
                                Créer un compte
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hasMoreUnlinked ? (
                  <div className="load-more">
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => setUnlinkedVisibleCount((count) => count + PAGE_SIZE)}
                    >
                      Charger plus ({filteredUnlinkedRiders.length - unlinkedVisibleCount} restant(s))
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </section>

      {linkRiderId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeLinkForm}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-rider-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2 id="link-rider-title">Créer un compte pour {linkRiderName}</h2>
                <p className="panel-sub">
                  Le nouveau profil sera lié au livreur importé depuis Excel.
                </p>
              </div>
              <button
                type="button"
                className="button-ghost"
                onClick={closeLinkForm}
                disabled={linkPending}
              >
                Fermer
              </button>
            </header>

            <form className="rider-link-form" onSubmit={handleLinkSubmit} noValidate>
              <label className="field">
                <span className="field-label">Nom complet</span>
                <input
                  type="text"
                  name="linkDisplayName"
                  value={linkDisplayName}
                  onChange={(event) => setLinkDisplayName(event.target.value)}
                  placeholder="Rida Alaoui"
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span className="field-label">Adresse e-mail</span>
                <input
                  type="email"
                  name="linkEmail"
                  value={linkEmail}
                  onChange={(event) => setLinkEmail(event.target.value)}
                  placeholder="livreur@bringo.ma"
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span className="field-label">Mot de passe</span>
                <input
                  type="password"
                  name="linkPassword"
                  value={linkPassword}
                  onChange={(event) => setLinkPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </label>

              <div className="rider-link-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={linkPending}
                >
                  {linkPending ? 'Création…' : 'Créer et lier le compte'}
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={closeLinkForm}
                  disabled={linkPending}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
