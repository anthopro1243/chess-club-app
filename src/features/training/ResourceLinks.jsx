import ExternalLink from '../../ui/ExternalLink.jsx';
import { lichessForTheme, videoForTheme } from '../../data/resources.js';

/** A video's title without YouTube's "| series | presenter | channel" tail. */
export const shortTitle = (video) => String(video?.title ?? '').split(' | ')[0];

/** The link to a video: "Title (Channel) on YouTube", opening in a new tab. */
export function VideoLink({ video }) {
  if (!video) return null;
  return (
    <ExternalLink href={video.url}>
      {shortTitle(video)} ({video.channel}) on YouTube
    </ExternalLink>
  );
}

/** The link to a Lichess theme: "Fork puzzles on Lichess". */
export function LichessLink({ label, url }) {
  return <ExternalLink href={url}>{label} on Lichess</ExternalLink>;
}

/*
 * ThemeResources — one tactic's video and Lichess link, side by side. The
 * Coach page's club weaknesses use it so a coach can put both on the
 * projector. A theme with no video of its own shows just the puzzles link.
 */
export default function ThemeResources({ theme }) {
  const lichess = lichessForTheme(theme);
  const video = videoForTheme(theme);
  if (!lichess && !video) return null;
  return (
    <span className="theme-resources">
      {video && <VideoLink video={video} />}
      {lichess && <LichessLink label={`${lichess.label} puzzles`} url={lichess.url} />}
    </span>
  );
}
