/**
 * TabBar — the persistent bottom tab bar.
 *
 * Three tabs, per the settled decision in CLAUDE.md: Penny · Add · My Books.
 * Connect functionality is merged into Add; Profile / Memory / Preferences
 * live behind the avatar menu.
 */

import React from "react";

function PennyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h14a2 2 0 012 2v8a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2z"/>
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="11" y1="7" x2="11" y2="15"/>
      <line x1="7" y1="11" x2="15" y2="11"/>
    </svg>
  );
}

function BooksIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h8a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H2V4z"/>
      <path d="M20 4h-8a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h8V4z"/>
    </svg>
  );
}

const TABS = [
  { id: "penny", label: "Penny",    Icon: PennyIcon },
  { id: "add",   label: "Add",      Icon: AddIcon   },
  { id: "books", label: "My Books", Icon: BooksIcon },
];

export default function TabBar({ active, navigate }) {
  return (
    <nav className="tab-bar" aria-label="Primary navigation">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            aria-current={isActive ? "page" : undefined}
            className={"tab tab--" + id + (isActive ? " tab--active" : "")}
            onClick={() => navigate(`/${id}`)}
          >
            <span className="tab-icon-wrap" aria-hidden="true"><Icon /></span>
            <span className="tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
