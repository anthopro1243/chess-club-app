/*
 * Piece.jsx — an original, geometric SVG chess set.
 *
 * Every piece is drawn on a 45x45 viewBox so the shapes line up with each
 * other. Colour comes from CSS custom properties, which keeps the light and
 * dark themes in one place instead of duplicating the artwork.
 */

const SHAPES = {
  p: (
    <>
      <circle cx="22.5" cy="13" r="5.6" />
      <path d="M17.6 18.2h9.8c-.2 4.2-2.3 6.3-2.8 11.8h-4.2c-.5-5.5-2.6-7.6-2.8-11.8z" />
      <path d="M13.2 30h18.6c1.6 2.9 2.7 4.6 2.9 6.9H10.3c.2-2.3 1.3-4 2.9-6.9z" />
    </>
  ),
  r: (
    <>
      <path d="M11 10h5.2v3.4h4.1V10h4.4v3.4h4.1V10H34v8.6H11z" />
      <path d="M14.3 18.6h16.4l-1.4 11.6H15.7z" />
      <path d="M12.6 30.2h19.8v3.3H12.6z" />
      <path d="M10 33.5h25v3.4H10z" />
    </>
  ),
  n: (
    <>
      <path d="M25.8 6.4c.7 1.2.9 2.4.7 3.6 4.6 1.9 7.6 5.9 8.5 10.8 1 5.3.7 10.6-.2 16.1H12.6c-.3-5.2 1.2-9.2 4.4-12.5 1.9-2 3.4-3.4 4.4-4.9l-4.5 1.7c-1.6.6-3 .1-3.7-1.3l-1.4-2.9 4.7-2.4 1.6-3.5c1.4-3 4.2-4.7 7.7-4.7z" />
      <path d="M27.7 6.6l4.6-2.4-.6 6z" />
      <circle cx="18.6" cy="16.2" r="1.5" className="piece-eye" />
    </>
  ),
  b: (
    <>
      <path d="M22.5 5.8c3.6 3.2 6.6 7.4 6.6 11.9 0 3.8-2.9 6.6-6.6 6.6s-6.6-2.8-6.6-6.6c0-4.5 3-8.7 6.6-11.9z" />
      <path d="M19.3 19.1 26.4 11.2" className="piece-slit" />
      <path d="M17.5 24.6h10l-1 6.2h-8z" />
      <path d="M12.8 30.8h19.4v3.1H12.8z" />
      <path d="M10.6 33.9h23.8v3H10.6z" />
    </>
  ),
  q: (
    <>
      <path d="M8.4 31.6 5.6 13.8l6.9 6.1L16.2 8l6.3 10.3L28.8 8l3.7 11.9 6.9-6.1-2.8 17.8z" />
      <circle cx="5.6" cy="11.6" r="2.6" />
      <circle cx="16.2" cy="6" r="2.6" />
      <circle cx="22.5" cy="16.2" r="2.6" />
      <circle cx="28.8" cy="6" r="2.6" />
      <circle cx="39.4" cy="11.6" r="2.6" />
      <path d="M8.9 31.9h27.2v3H8.9z" />
      <path d="M7 34.9h31v3.1H7z" />
    </>
  ),
  k: (
    <>
      <path d="M21 4.4h3v4.1h4.1v3H24v4.2h-3v-4.2h-4.1v-3H21z" />
      <path d="M22.5 16.4c6.4 0 11.1 3.9 12.7 9.2.9 3.2 1 5.4 1 7.2H8.8c0-1.8.1-4 1-7.2 1.6-5.3 6.3-9.2 12.7-9.2z" />
      <path d="M9.5 32.8h26v3H9.5z" />
      <path d="M7.6 35.8h29.8v3.1H7.6z" />
    </>
  ),
};

export default function Piece({ type, color, className = '' }) {
  return (
    <svg
      viewBox="0 0 45 45"
      className={`piece piece-${color} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <g>{SHAPES[type]}</g>
    </svg>
  );
}

export const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
