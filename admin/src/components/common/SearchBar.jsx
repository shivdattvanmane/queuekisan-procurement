import { FiSearch } from 'react-icons/fi';

export default function SearchBar({ value, onChange, placeholder = "Search..." }) {
  return (
    <div style={{ position: 'relative', width: '300px' }}>
      <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
      <input
        type="text"
        className="form-input"
        style={{ paddingLeft: '36px' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
