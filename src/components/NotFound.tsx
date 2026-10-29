import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="notice-page">
      <p className="notice-code">404</p>
      <h1>Page introuvable</h1>
      <p className="notice-text">Cette adresse ne correspond à aucun écran de l’application.</p>
      <Link className="button button-primary" to="/">
        Revenir au tableau de bord
      </Link>
    </div>
  );
}
