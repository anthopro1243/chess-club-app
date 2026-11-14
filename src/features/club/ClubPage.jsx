import { useMemo, useState } from 'react';
import { usePlayers, useCloudStatus, useMyProfile } from '../roster/rosterStore.js';
import { useAccount } from '../account/accountStore.js';
import { isCloud } from '../../services/backend.js';
import InfoTooltip from '../../ui/InfoTooltip.jsx';
import PlayerHome from './PlayerHome.jsx';
import { useSkillScores } from '../analysis/analysisStore.js';
import { activePlayerIdSet, onlyActiveRows } from '../roster/retiredPlayers.js';
import { clubProfile, weakestCategories } from '../../analysis/skillModel.js';
import { CATEGORY_KEYS } from '../../analysis/scoring.js';
import { usePlatformRatings, useRatingOverrides } from '../ratings/ratingStore.js';
import { rankForLeaderboard } from '../../analysis/ratings.js';
import Link from '../../ui/Link.jsx';
import Icon from '../../ui/Icon.jsx';
import Avatar from '../../ui/Avatar.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { PageActions, usePageMeta } from '../../ui/PageHeader.jsx';

// What people come to the home page to do, as large targets.
const QUICK_ACTIONS = [
  { to: 'play', icon: 'play', title: 'Play a game', text: 'A clubmate or the computer.' },
  { to: 'training', icon: 'training', title: 'Train', text: 'Puzzles for what you miss.' },
  { to: 'games', icon: 'games', title: 'Games', text: 'Review one or log a result.' },
  { to: 'roster', icon: 'roster', title: 'Roster', text: 'Everyone in the club.' },
];

/** DashboardPage — the club at a glance: who's here, and how they rank. */
export default function ClubPage() {
  const players = usePlayers();
  const cloud = useCloudStatus();

  /*
   * The signed-in member's own page sits above the club view. It needs a
   * linked roster row: an account that has not claimed one has no games or
   * scores to show, and the account menu already offers the claim.
   */
  const me = useMyProfile();
  const account = useAccount();
  const myViewer = useMemo(
    () => (me ? { role: account.role, playerId: me.playerId } : null),
    [me, account.role],
  );

  /*
   * Local mode has no accounts, so no signed-in player: the one local user is
   * the coach (accountStore's LOCAL_ADMIN). Rather than faking a sign-in, the
   * coach can preview any roster member's page. Local only - with a backend,
   * each member sees their own page when they sign in.
   */
  const canPreview = !isCloud && account.isCoach;
  const [previewId, setPreviewId] = useState('');
  const previewViewer = useMemo(() => ({ role: account.role, playerId: null }), [account.role]);
  const previewing = canPreview && players.some((p) => p.playerId === previewId);
  // The club profile now prefers real engine measurements over an untouched
  // manual rubric, and leaves a category blank rather than averaging "no data"
  // as zero - which is what made every category read a flat 2.5.
  // Scores stay in the table after a member is retired; only roster members count.
  const activeIds = useMemo(() => activePlayerIdSet(players), [players]);
  const allSkillRows = useSkillScores();
  const skillRows = useMemo(() => onlyActiveRows(allSkillRows, activeIds), [allSkillRows, activeIds]);
  const skillsByPlayer = useMemo(() => {
    const out = {};
    for (const row of skillRows) {
      (out[row.playerId] ||= {})[row.category] = row;
    }
    return out;
  }, [skillRows]);
  const profile = useMemo(() => clubProfile(players, skillsByPlayer), [players, skillsByPlayer]);
  const weakest = useMemo(() => weakestCategories(profile, 3), [profile]);
  const rated = players.filter((p) => p.ratings.uscf != null);
  const averageRating = rated.length
    ? Math.round(rated.reduce((sum, p) => sum + p.ratings.uscf, 0) / rated.length)
    : null;

  /*
   * The leaderboard used to sort on players.club_rating: a single Glicko-2
   * number computed by pouring bullet, blitz, rapid and daily games into one
   * pool, cold-starting at RD 350. It produced swings of -195 in a single game
   * and an unlabelled "1177" that meant nothing in particular.
   *
   * The sort key is now explicit and documented: a coach override wins,
   * otherwise an official USCF/FIDE number, otherwise a platform rating -
   * which is shown WITH its platform and time control, and is flagged as not
   * comparable across platforms, so it is listed separately rather than
   * ranked against a different scale.
   */
  const allPlatformRatings = usePlatformRatings();
  const platformRatings = useMemo(
    () => onlyActiveRows(allPlatformRatings, activeIds),
    [allPlatformRatings, activeIds],
  );
  const overrides = useRatingOverrides();
  const { ranked, unranked } = useMemo(() => {
    const entries = players.map((player) => ({
      player,
      playerId: player.playerId,
      override: overrides.find((o) => o.playerId === player.playerId) ?? null,
      official: player.ratings?.uscf != null
        ? { platform: 'uscf', rating: player.ratings.uscf }
        : null,
      platformRatings: platformRatings
        .filter((r) => r.playerId === player.playerId)
        .map((r) => ({ platform: r.platform, timeControl: r.timeControl, rating: r.rating })),
    }));
    return rankForLeaderboard(entries);
  }, [players, platformRatings, overrides]);
  const leaderboard = ranked;
  // With nobody ranked, only the members who have an online rating are worth listing.
  const unrankedShown = leaderboard.length ? unranked : unranked.filter((e) => e.resolved.rating != null);

  // A member is greeted by name; everyone else gets the page's own title.
  const hasOwnHome = isCloud && !!me && account.isApproved;
  const firstName = hasOwnHome ? String(me.name || '').trim().split(/\s+/)[0] : '';
  usePageMeta(
    firstName ? { title: `Welcome back, ${firstName}`, summary: 'Your games, your training, and the club.' } : null,
  );

  return (
    <div className="dashboard">

      {/* Local mode has no sign-in, so the coach picks whose page to look at. */}
      {canPreview && players.length > 0 && (
        <PageActions>
          <label className="preview-pick">
            <span>Preview as</span>
            <select value={previewing ? previewId : ''} onChange={(event) => setPreviewId(event.target.value)}>
              <option value="">Nobody</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </PageActions>
      )}

      {hasOwnHome && <PlayerHome playerId={me.playerId} viewer={myViewer} />}
      {previewing && <PlayerHome playerId={previewId} viewer={previewViewer} preview />}

      {/* A member with their own page above already has "Play a game" there. */}
      {!hasOwnHome && !previewing && (
        <nav className="action-grid" aria-label="Start here">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.to} to={action.to} className="action-card">
              <span className="action-card-icon">
                <Icon name={action.icon} size={22} />
              </span>
              <span className="action-card-text">
                <span className="action-card-title">{action.title}</span>
                <span className="action-card-detail">{action.text}</span>
              </span>
              <Icon name="chevron-right" size={18} className="action-card-chevron" />
            </Link>
          ))}
        </nav>
      )}

      <section className="stat-row" aria-label="The club in numbers">
        <Stat icon="roster" label="Players" value={players.length} />
        <Stat icon="star" label="Rated players" value={rated.length} />
        <Stat icon="chart" label="Average USCF" value={averageRating ?? '—'} />
        <Stat
          icon="trophy"
          label="Competitive track"
          value={players.filter((p) => p.commitment === 'Competitive').length}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div className="heading-row">
            <h2>Club leaderboard</h2>
            <InfoTooltip label="More about Club leaderboard">
              Ranked by the coach&rsquo;s rating if there is one, then USCF, then Chess.com or
              Lichess. The small label says where each number comes from.
            </InfoTooltip>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <EmptyState
            icon="trophy"
            title={players.length > 0 ? 'Nobody is ranked yet' : 'No players yet'}
            actions={
              <Link to="roster" className="btn">
                Open the roster
              </Link>
            }
          >
            {players.length > 0
              ? 'A USCF rating, a Chess.com rapid rating from a linked account, or a rating the coach sets puts someone here.'
              : cloud.configured
                ? 'No one has joined yet.'
                : 'Add players on the Roster page to start tracking ratings.'}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="roster-table leaderboard">
              <caption className="sr-only">Club leaderboard</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Name</th>
                  <th scope="col">Rating</th>
                  <th scope="col" className="hide-narrow">Puzzles solved</th>
                  <th scope="col" className="hide-narrow">Track</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => {
                  const player = entry.player;
                  return (
                    <tr key={player.playerId}>
                      <td>
                        <span className={`rank ${index < 3 ? `rank-${index + 1}` : ''}`}>{index + 1}</span>
                      </td>
                      <td>
                        <Link to="roster" params={{ player: player.playerId }} className="person">
                          <Avatar name={player.name} size="sm" />
                          <span className="person-name">{player.name}</span>
                        </Link>
                      </td>
                      <td className="mono">
                        {entry.resolved.rating}
                        <span className="hint-text"> {entry.resolved.label}</span>
                      </td>
                      <td className="mono hide-narrow">{player.puzzleStats?.solvedIds?.length || 0}</td>
                      <td className="hide-narrow">
                        <span className={`track ${player.commitment.toLowerCase()}`}>
                          {player.commitment}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {unrankedShown.length > 0 && (
          <div className="unranked-note">
            <p className="muted small">
              {leaderboard.length
                ? 'Not ranked. Online ratings aren’t on the same scale as the ones above.'
                : 'Online ratings, not ranked: each site uses its own scale.'}
            </p>
            <ul className="muted small">
              {unrankedShown.map((entry) => (
                <li key={entry.playerId}>
                  <Link to="roster" params={{ player: entry.playerId }} className="name-link">
                    {entry.player.name}
                  </Link>
                  :{' '}
                  {entry.resolved.rating != null
                    ? `${entry.resolved.rating} (${entry.resolved.label})`
                    : 'unrated'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className={account.isCoach ? 'two-column' : ''}>
        <section className="panel">
          <div className="panel-header">
            <h2>Club skill profile</h2>
          </div>
          <div className="rubric">
            {CATEGORY_KEYS.map((key) => {
              const entry = profile[key];
              const score = entry?.rubricAverage;
              return (
                <div className="rubric-row" key={key}>
                  <span className="rubric-label">
                    {entry?.label ?? key}
                    {entry?.engineBacked > 0 && <em className="rubric-suggestion">from games</em>}
                  </span>
                  <span className="rubric-bar">
                    <span
                      className={`rubric-fill ${score == null ? '' : score <= 3 ? 'low' : score <= 6 ? 'mid' : 'high'}`}
                      style={{ width: `${(score ?? 0) * 10}%` }}
                    />
                  </span>
                  <span className="rubric-score mono">
                    {score == null ? '—' : score.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Scored from analyzed games. A dash means not enough games yet.
          </p>
        </section>

        {/* Lesson planning is the coach's call; members have their own priority above. */}
        {account.isCoach && (
          <section className="panel">
            <div className="panel-header">
              <div className="heading-row">
                <h2>Teach to the whole group</h2>
                <InfoTooltip label="More about Teach to the whole group">The club&rsquo;s three weakest areas. Good topics for a group lesson.</InfoTooltip>
              </div>
            </div>
            {weakest.length ? (
              <ol className="priority-list">
                {weakest.map((area, index) => (
                  <li key={area.category}>
                    <span className="priority-rank">{index + 1}</span>
                    <span className="priority-label">{area.label}</span>
                    <span className="mono">{area.rubricAverage.toFixed(1)} / 10</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint-text">Shows up once enough of the club&rsquo;s games are analyzed.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <span className="stat-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
