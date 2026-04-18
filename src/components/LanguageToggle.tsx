import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export default function LanguageToggle() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
    localStorage.setItem('i18nextLng', newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="nav-action-btn"
      title={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
      aria-label={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Globe size={18} strokeWidth={2} />
      <span className="nav-action-label">
        {i18n.language === 'zh' ? 'EN' : '中'}
      </span>
    </button>
  );
}
