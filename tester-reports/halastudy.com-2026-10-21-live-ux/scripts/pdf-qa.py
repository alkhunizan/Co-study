from pathlib import Path
import fitz, re, json, math
from PIL import Image, ImageDraw, ImageOps

root=Path(__file__).resolve().parents[1]
dest=root/'verification'/'pdf-qa'
dest.mkdir(parents=True,exist_ok=True)
results=[]
for lang in ['en','ar']:
    pdf=root/f'halastudy.com-ux-report-2026-10-21-{lang}.pdf'
    doc=fitz.open(pdf)
    appendix=next(i for i,p in enumerate(doc) if p.get_images())
    selected=sorted(set([0,appendix]))
    page_text='\n'.join(p.get_text() for p in doc)
    bounds=[]
    for i,p in enumerate(doc):
        for b in p.get_text('blocks'):
            if b[0]<-0.5 or b[1]<-0.5 or b[2]>p.rect.width+0.5 or b[3]>p.rect.height+0.5:
                bounds.append({'page':i+1,'bbox':b[:4]})
    for i in selected:
        doc[i].get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False).save(dest/f'{lang}-page-{i+1:02d}.png')
    thumbs=[]
    for i,p in enumerate(doc):
        pix=p.get_pixmap(matrix=fitz.Matrix(0.5,0.5),alpha=False)
        im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
        thumbs.append((i,ImageOps.contain(im,(298,422))))
    cols=4; sheet=Image.new('RGB',(cols*308,math.ceil(len(thumbs)/cols)*450),'#dce1ea')
    draw=ImageDraw.Draw(sheet)
    for i,im in thumbs:
        x=(i%cols)*308;y=(i//cols)*450
        draw.text((x+8,y+6),f'{lang} page {i+1}',fill='black')
        sheet.paste(im,(x+5,y+24))
    sheet.save(dest/f'{lang}-all-pages.jpg',quality=92)
    md=(root/('REPORT.md' if lang=='en' else 'REPORT.ar.md')).read_text(encoding='utf-8')
    shots=list(dict.fromkeys(s for s in re.findall(r'`([^`]+)`',md) if s.lower().endswith(('.png','.jpg','.jpeg'))))
    missing=[s for s in shots if not (root/s).is_file()]
    result={'lang':lang,'pages':len(doc),'appendixFirstPage':appendix+1,'citedScreenshots':len(shots),'missingScreenshots':missing,'dateSearchMatches':sum(len(p.search_for('2026-10-21')) for p in doc),'textOutOfPage':bounds,'replacementGlyphs':page_text.count('\ufffd'),'arabicLetters':len(re.findall(r'[\u0600-\u06ff]',page_text)),'fontNames':sorted(set(f[3] for p in doc for f in p.get_fonts()))}
    results.append(result)
    if missing or bounds or result['dateSearchMatches']==0 or (lang=='ar' and result['arabicLetters']<500):
        raise RuntimeError(result)
fs=(root/'verification'/'pdf-qa.json')
fs.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
