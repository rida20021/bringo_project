import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  id: string;
  name: string;
  /** Extra text matched by the search input (e.g. an external id or city). */
  keywords?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

/**
 * Select-like control whose search field lives inside the dropdown menu.
 */
export default function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Sélectionner...',
  searchPlaceholder = 'Rechercher...',
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const labelId = `${listboxId}-label`;

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus({ preventScroll: true });
    else setSearchTerm('');
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => {
      const haystack = `${option.name} ${option.keywords ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [options, searchTerm]);

  const selectedOption = options.find((option) => option.id === value);

  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="combobox" ref={containerRef}>
        <button
          type="button"
          className={`combobox-trigger${selectedOption ? '' : ' is-placeholder'}`}
          onClick={() => setIsOpen((open) => !open)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-labelledby={`${labelId} combobox-value-${listboxId}`}
        >
          <span className="combobox-value" id={`combobox-value-${listboxId}`}>
            {selectedOption ? selectedOption.name : placeholder}
          </span>
        </button>

        {isOpen ? (
          <div className="combobox-menu">
            <div className="combobox-search-wrapper">
              <input
                ref={searchRef}
                type="text"
                className="combobox-search"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Never submit the surrounding form while searching.
                    event.preventDefault();
                    const firstMatch = filteredOptions[0];
                    if (firstMatch) {
                      onChange(firstMatch.id);
                      setIsOpen(false);
                    }
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setIsOpen(false);
                  }
                }}
                autoComplete="off"
                aria-label={searchPlaceholder}
                aria-controls={listboxId}
              />
            </div>
            <ul className="combobox-options" id={listboxId} role="listbox" aria-label={label}>
              {filteredOptions.length === 0 ? (
                <li className="combobox-empty">Aucun résultat trouvé</li>
              ) : (
                filteredOptions.map((option) => (
                  <li
                    key={option.id}
                    role="option"
                    aria-selected={option.id === value}
                    className={`combobox-option${option.id === value ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                    }}
                  >
                    {option.name}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
