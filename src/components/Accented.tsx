import React from 'react';

// Текст со *звёздочками* → выделенные слова цветом акцента
export const Accented: React.FC<{text: string; accent: string; charClass?: string}> = ({text, accent, charClass}) => {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  let key = 0;
  return (
    <>
      {parts.map((part) => {
        const hot = part.startsWith('*') && part.endsWith('*');
        const clean = hot ? part.slice(1, -1) : part;
        return clean.split(/(\s+)/).map((word) => {
          if (/^\s+$/.test(word)) return <span key={key++}> </span>;
          return (
            <span key={key++} style={{display: 'inline-block', whiteSpace: 'nowrap', color: hot ? accent : undefined}}>
              {charClass
                ? [...word].map((ch, i) => (
                    <span key={i} className={charClass} style={{display: 'inline-block'}}>
                      {ch}
                    </span>
                  ))
                : word}
            </span>
          );
        });
      })}
    </>
  );
};
