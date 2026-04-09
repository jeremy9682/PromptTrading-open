import React, { useEffect, useMemo, useState } from 'react';

const loadLearnData = async (language) => {
  if (language === 'zh') {
    const mod = await import('../../constants/learn.zh-CN.json');
    return mod.default || mod;
  }
  const mod = await import('../../constants/learn.en-US.json');
  return mod.default || mod;
};

const cardClass = 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm';
const mutedText = 'text-gray-600 dark:text-gray-400';

import { useNavigate } from 'react-router-dom';

const LearnTab = ({ t, language }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    loadLearnData(language)
      .then((d) => {
        if (mounted) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(e?.message || 'Failed to load content');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [language]);

  const toc = useMemo(() => (data?.toc || []), [data]);
  const [activeId, setActiveId] = useState(null);
  const [openFaq, setOpenFaq] = useState({});
  const [openSections, setOpenSections] = useState({});
  useEffect(() => {
    if (!data?.sections) return;
    // default: open first 2 sections
    const defaults = {};
    data.sections.forEach((s, i) => {
      defaults[s.id] = i < 2;
    });
    setOpenSections(defaults);
  }, [data]);

  const renderTextWithLinks = (text) => {
    if (!text || typeof text !== 'string') return text;
    const urlRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, idx) => {
      if ((/^(https?:\/\/|www\.)/).test(part)) {
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a key={idx} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-300 hover:underline break-all">
            {part}
          </a>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  useEffect(() => {
    if (!data?.sections) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0.1 }
    );
    const elements = data.sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean);
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  const handleTocClick = (id) => (e) => {
    e.preventDefault();
    setOpenSections((s) => ({ ...s, [id]: true }));
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Fallback to location hash if element not found yet
      window.location.hash = `#${id}`;
    }
    setActiveId(id);
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      <div className={`${cardClass} bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 border border-blue-100 dark:border-blue-500/20 p-8`}>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t[language].learnCenter}</h2>
        <p className={`${mutedText}`}>{data?.hero?.subheading || (language === 'zh' ? '从零开始学习 DeFi 交易' : 'Learn DeFi trading from scratch')}</p>
        {data?.hero?.ctas && (
          <div className="mt-4 flex flex-wrap gap-3">
            {data.hero.ctas.map((c, idx) => (
              <button
                key={idx}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition"
                type="button"
                data-target={c.target}
                onClick={() => {
                  const map = {
                    WalletTab: '/wallet',
                    TradingDashboardTab: '/'
                  };
                  const next = map[c.target];
                  if (next) navigate(next);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className={`${mutedText}`}>{language === 'zh' ? '加载中…' : 'Loading…'}</div>
      )}
      {error && (
        <div className="text-red-600 dark:text-red-400">{error}</div>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-3 space-y-2">
            <div className={`sticky top-4 ${cardClass} p-4`}>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-200 mb-3">{language === 'zh' ? '目录' : 'Contents'}</div>
              <nav className="space-y-1">
                {toc.map((item) => {
                  const isActive = activeId === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={handleTocClick(item.id)}
                      className={`block text-sm transition ${
                        isActive
                          ? 'text-blue-600 dark:text-white font-semibold'
                          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      {item.title}
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-9 space-y-6">
            {data.sections?.map((section) => (
              <section key={section.id} id={section.id} className={cardClass}>
                <header className="p-6 flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{section.title}</h3>
                  <button
                    type="button"
                    className={`text-sm ${mutedText} hover:text-gray-900 dark:hover:text-white transition`}
                    onClick={() => setOpenSections((s) => ({ ...s, [section.id]: !s[section.id] }))}
                  >
                    {openSections[section.id] ? (language === 'zh' ? '收起' : 'Collapse') : (language === 'zh' ? '展开' : 'Expand')}
                  </button>
                </header>
                {openSections[section.id] && (
                  <div className="px-6 pb-6 space-y-3">
                    {/* Minimal render for scaffold; detailed render will be added later */}
                    {section.content?.map((block, idx) => {
                  if (block.kind === 'paragraph') {
                    return <p key={idx} className={`${mutedText} leading-7`}>{renderTextWithLinks(block.text)}</p>;
                  }
                  if (block.kind === 'list') {
                    return (
                      <div key={idx} className="mb-3">
                        {block.title && <div className="text-gray-900 dark:text-gray-200 font-medium mb-1">{block.title}</div>}
                        <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1">
                          {block.items?.map((li, i) => (<li key={i}>{renderTextWithLinks(li)}</li>))}
                        </ul>
                      </div>
                    );
                  }
                  if (block.kind === 'step') {
                    return (
                      <div key={idx} className="mb-3">
                        <div className="text-gray-900 dark:text-gray-200 font-medium mb-1">{block.title}</div>
                        <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-1">
                          {block.items?.map((li, i) => (<li key={i}>{renderTextWithLinks(li)}</li>))}
                        </ol>
                      </div>
                    );
                  }
                  if (block.kind === 'callout') {
                    const toneColors = {
                      info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100',
                      warning: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-400/30 dark:bg-yellow-400/10 dark:text-yellow-100',
                      success: 'border-green-200 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-100'
                    };
                    return (
                      <div key={idx} className={`border rounded-lg p-3 ${toneColors[block.tone] || 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/20 dark:bg-transparent dark:text-gray-200'}`}>
                        <div className="font-semibold mb-1">{block.title}</div>
                        <div className="text-sm opacity-90">{renderTextWithLinks(block.text)}</div>
                      </div>
                    );
                  }
                  if (block.kind === 'cta') {
                    return (
                      <button
                        key={idx}
                        type="button"
                        data-target={block.target}
                        className="mt-2 px-3 py-2 rounded-md bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition"
                        onClick={() => {
                          const map = {
                            WalletTab: '/wallet',
                            TradingDashboardTab: '/'
                          };
                          const next = map[block.target];
                          if (next) navigate(next);
                        }}
                      >
                        {block.label}
                      </button>
                    );
                  }
                  return null;
                    })}
                  </div>
                )}
              </section>
            ))}

            {data.faq && (
              <section id="faq" className={`${cardClass} p-6`}>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{language === 'zh' ? '常见问题' : 'FAQ'}</h3>
                <div className="space-y-3">
                  {data.faq.map((qa, idx) => {
                    const isOpen = !!openFaq[idx];
                    return (
                      <div key={idx} className="border border-gray-200 dark:border-white/10 rounded-lg">
                        <button
                          type="button"
                          className="w-full text-left p-4 flex items-center justify-between gap-3"
                          onClick={() => setOpenFaq((s) => ({ ...s, [idx]: !s[idx] }))}
                        >
                          <span className="text-gray-900 dark:text-gray-200 font-medium">{qa.q}</span>
                          <span className={`${mutedText} text-sm`}>{isOpen ? (language === 'zh' ? '收起' : 'Hide') : (language === 'zh' ? '展开' : 'Show')}</span>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 text-gray-700 dark:text-gray-300 text-sm leading-6">{qa.a}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {data.glossary && (
              <section id="glossary" className={`${cardClass} p-6`}>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{language === 'zh' ? '术语表' : 'Glossary'}</h3>
                <dl className="grid md:grid-cols-2 gap-4">
                  {data.glossary.map((g, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-white/10 rounded-lg p-4">
                      <dt className="text-gray-900 dark:text-gray-200 font-medium">{g.term}</dt>
                      <dd className="text-gray-700 dark:text-gray-300 text-sm mt-1">{g.def}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {data.troubleshooting && (
              <section id="troubleshooting" className={`${cardClass} p-6`}>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{language === 'zh' ? '故障排查' : 'Troubleshooting'}</h3>
                <div className="space-y-3">
                  {data.troubleshooting.map((it, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-white/10 rounded-lg p-4">
                      <div className="text-gray-900 dark:text-gray-200 font-medium mb-1">{it.issue}</div>
                      <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 text-sm space-y-1">
                        {it.fix?.map((f, i) => (<li key={i}>{f}</li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.furtherReading && (
              <section id="further-reading" className={`${cardClass} p-6`}>
                <h3 className="text-xl font-semibold text-gray-900 dark:text白 mb-3">{language === 'zh' ? '延伸学习：DeFi 通识' : 'Further Reading: DeFi Basics'}</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.furtherReading.map((fr, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-white/10 rounded-lg p-4">
                      <div className="text-gray-900 dark:text-gray-200 font-medium mb-1">{fr.title}</div>
                      <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 text-sm space-y-1">
                        {fr.bullets?.map((b, i) => (<li key={i}>{b}</li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default LearnTab;

