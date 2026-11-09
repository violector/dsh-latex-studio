import datetime, hashlib, json, pathlib, shutil, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
cache = root / '.dev/downloads'
target = root / 'templates'
(target / 'upstream').mkdir(parents=True, exist_ok=True)
catalog = []
validation_path = target / 'validation.json'
validation = {v['id']: v for v in json.loads(validation_path.read_text())} if validation_path.exists() else {}
bib = '% Add real references here, or import a DOI through LaTeX Studio.\n'
body = r'''
\section{Introduction}
% Describe the research question, motivation and contributions.
Start writing your manuscript here.

\section{Methods}
% Describe reproducible methods and define all symbols.
\begin{equation}
  \mathcal{L}(\theta) = \frac{1}{N}\sum_{i=1}^{N}(f_\theta(x_i)-y_i)^2.
  \label{eq:objective}
\end{equation}

\section{Results}
% Replace placeholders with your actual findings.
Report your findings here.

\section{Discussion}
Discuss limitations and implications here.

\section{Conclusion}
Summarize the contributions here.
'''

def make(id, name, family, aliases, category, main, *, year=None, note='', engine='pdflatex', selector=None, license='See original upstream author kit; no SPDX license declared'):
    directory = target / id
    directory.mkdir(exist_ok=True)
    meta = {'url': 'https://www.latex-project.org/', 'sha256': None}
    if family:
        meta = json.loads((cache / (family + '-source.json')).read_text())
        archive = cache / (family + '.zip')
        shutil.copy2(archive, target / 'upstream' / archive.name)
        with zipfile.ZipFile(archive) as z:
            for path in z.namelist():
                p = pathlib.PurePosixPath(path)
                if p.suffix in ['.cls', '.sty', '.bst'] and (not selector or selector(path)):
                    (directory / p.name).write_bytes(z.read(path))
                if p.name.lower() in ['readme', 'readme.md', 'license', 'license.txt', 'copying', 'manifest.txt'] and len(p.parts) < 3:
                    (directory / ('UPSTREAM-' + p.name)).write_bytes(z.read(path))
            if family == 'neurips':
                (directory / 'checklist.tex').write_bytes(z.read('checklist.tex'))
        if family in ['acm', 'elsevier']:
            cls = 'acmart' if family == 'acm' else 'elsarticle'
            for ext in ['cls', 'ins', 'dtx']:
                shutil.copy2(root / '.dev/generated' / family / (cls + '.' + ext), directory)
    (directory / 'main.tex').write_text(main, encoding='utf-8')
    (directory / 'references.bib').write_text(bib, encoding='utf-8')
    record = dict(id=id, name=name, family=family or 'article', category=category, aliases=aliases, year=year, mode='Authoring / review', engine=engine, directory=id, main='main.tex', source=meta['url'], sha256=meta['sha256'], license=license, note=note, retrievedAt=datetime.date.today().isoformat(), validation='pending')
    verified = validation.get(id)
    if verified and verified['upstreamSha256'] == meta['sha256'] and verified['starterSha256'] == hashlib.sha256((directory / 'main.tex').read_bytes()).hexdigest():
        record['validation'] = 'compiled-on-windows'
        record['testedAt'] = verified['testedAt']
    (directory / 'SOURCE.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    (directory / 'TEMPLATE-NOTES.md').write_text(f'# {name}\n\n{note}\n\nSource: {meta["url"]}\n\nLicense: {license}\n\nOfficial source files are unmodified. The main.tex starter is by LaTeX Studio. Verify the venue year, anonymity, page limits and required declarations before submission.\n', encoding='utf-8')
    catalog.append(record)

def article(cls, packages='', author=r'\author{Author Name}', bibliography='plain', before=''):
    result = cls + '\n' + packages + r'''
\usepackage{amsmath,graphicx,booktabs}
\title{LATEX_STUDIO_TITLE}
''' + author + '\n' + before + r'''
\begin{document}
\maketitle
\begin{abstract}
% State the problem, methods, actual findings and significance.
Write your abstract here.
\end{abstract}
''' + body + '\n% \\bibliographystyle{' + bibliography + '}\n% \\bibliography{references}\n\\end{document}\n'
    if bibliography == 'acl_natbib':
        result = result.replace('% \\bibliographystyle{acl_natbib}\n', '')
    if '{acmart}' in cls:
        result = result.replace('\\maketitle\n', '').replace('\\end{abstract}\n', '\\end{abstract}\n\\maketitle\n')
    return result

make('article', '通用英文论文 / arXiv 起稿', None, ['article','arxiv','preprint','英文','通用'], 'general', article(r'\documentclass[11pt]{article}', r'\usepackage[margin=1in]{geometry}\usepackage{hyperref}'), license='MIT (starter); LaTeX packages retain their licenses', note='通用草稿，不代表 arXiv 学科分类或目标期刊的专用格式。')
make('chinese', '中文研究稿 · CTeX', None, ['中文','ctex','Chinese'], 'general', article(r'\documentclass[UTF8,fontset=fandol]{ctexart}'), engine='xelatex', license='MIT (starter)', note='使用随 TeX Live 分发的 Fandol 字体，不依赖本机中文字体。')
make('ieee-conference', 'IEEE 会议 · 双栏', 'ieee', ['IEEE','ICRA','IROS','ICASSP','ICIP','INFOCOM','会议'], 'computer', article(r'\documentclass[conference]{IEEEtran}', author=r'\author{\IEEEauthorblockN{Author Name}\IEEEauthorblockA{Institution\\email@example.com}}', bibliography='IEEEtran'), license='LPPL-1.3', note='IEEEtran conference 基础格式；具体会议的匿名要求和补充样式须单独核对。')
make('ieee-journal', 'IEEE Transactions · 期刊', 'ieee', ['IEEE Transactions','TPAMI','TNNLS','TIP','TMI','TBME','TVCG'], 'computer', article(r'\documentclass[journal]{IEEEtran}', bibliography='IEEEtran'), license='LPPL-1.3', note='适用于采用 IEEEtran 的 Transactions 起稿；医学影像等期刊的专属要求仍以投稿指南为准。')
make('acm-conference', 'ACM 会议 · SIGCONF', 'acm', ['ACM','SIGCONF','KDD','SIGIR','WWW','CIKM','WSDM','SIGMOD'], 'computer', article(r'\documentclass[sigconf,review,anonymous]{acmart}', before=r'\setcopyright{none}\settopmatter{printacmref=false}', bibliography='ACM-Reference-Format'), license='LPPL-1.3c', note='匿名审稿双栏起稿；部分 ACM 会议要求单栏 manuscript，按该会议指南选择。')
make('acm-journal', 'ACM 期刊 / 单栏审稿', 'acm', ['ACM journal','TOIS','TOG','TIST','TOSEM','CSUR','manuscript'], 'computer', article(r'\documentclass[manuscript,review,anonymous]{acmart}', before=r'\setcopyright{none}\settopmatter{printacmref=false}', bibliography='ACM-Reference-Format'), license='LPPL-1.3c', note='ACM manuscript 审稿起稿；录用后需补充真实版权与出版元数据。')
make('neurips-2026', 'NeurIPS 2026', 'neurips', ['NeurIPS','NIPS','神经信息处理'], 'computer', article(r'\documentclass{article}', r'\usepackage{neurips_2026}', bibliography='plainnat'), year=2026, note='官方 2026 样式；完整 checklist.tex 随原始作者包提供，投稿前需要据实填写。')
make('iclr-2027', 'ICLR 2027', 'iclr', ['ICLR','representation learning','表示学习'], 'computer', article(r'\documentclass{article}', r'\usepackage{iclr2027_conference,times}', bibliography='iclr2027_conference'), year=2027, selector=lambda p: '/iclr2027/' in p, note='官方仓库 ICLR 2027 样式，默认匿名审稿。')
make('iclr-2026', 'ICLR 2026 · 历史版本', 'iclr', ['ICLR 2026'], 'computer', article(r'\documentclass{article}', r'\usepackage{iclr2026_conference,times}', bibliography='iclr2026_conference'), year=2026, selector=lambda p: '/iclr2026/' in p, note='保留用于已有项目；新投稿请选择对应年份。')
icml = r'''\documentclass{article}
\usepackage{icml2026}
\usepackage{amsmath,graphicx,booktabs}
\icmltitlerunning{LATEX_STUDIO_TITLE}
\begin{document}
\twocolumn[
\icmltitle{LATEX_STUDIO_TITLE}
\begin{icmlauthorlist}
\icmlauthor{Anonymous Author}{inst}
\end{icmlauthorlist}
\icmlaffiliation{inst}{Institution, City, Country}
\icmlkeywords{Machine Learning}
\vskip 0.3in
]
\printAffiliationsAndNotice{}
\begin{abstract}
Write your abstract here.
\end{abstract}
''' + body + r'''
% \bibliography{references}
% \bibliographystyle{icml2026}
\end{document}
'''
make('icml-2026', 'ICML 2026', 'icml', ['ICML','机器学习国际会议'], 'computer', icml, year=2026, note='默认匿名审稿；录用稿按官方要求切换 accepted 选项。')
make('acl', 'ACL / EMNLP / NAACL', 'acl', ['ACL','EMNLP','NAACL','EACL','COLING','自然语言处理'], 'computer', article(r'\documentclass[11pt]{article}', r'\usepackage[review]{acl}\usepackage{times,latexsym}', bibliography='acl_natbib'), note='ACL 官方公共样式快照；不同会议的页数与 mandatory limitations 要求需核对。')
with zipfile.ZipFile(cache / 'cvpr.zip') as z:
    cvpr_main = z.read('author-kit-main/main.tex').decode()
import re
cvpr_year = int(re.search(r'\\def\\confYear\{(\d+)\}', cvpr_main).group(1))
make('cvpr', f'CVPR {cvpr_year}', 'cvpr', ['CVPR','computer vision','计算机视觉'], 'computer', article(r'\documentclass[10pt,twocolumn,letterpaper]{article}', r'\usepackage[review]{cvpr}\usepackage{times}\usepackage[pagebackref,breaklinks,colorlinks]{hyperref}', before=r'\def\paperID{00000}\def\confName{CVPR}\def\confYear{' + str(cvpr_year) + '}', bibliography='ieeenat_fullname'), year=cvpr_year, note='官方 author-kit 快照，审稿模式。paperID 必须替换为实际投稿编号。')
make('lncs', 'Springer LNCS · 会议论文', 'lncs', ['LNCS','ECCV','MICCAI','Springer conference','医学图像'], 'computer', article(r'\documentclass[runningheads]{llncs}', author=r'\author{Author Name}\institute{Institution\\\email{email@example.com}}', bibliography='splncs04'), license='CC-BY-4.0-or-later', note='LNCS 基础格式；ECCV、MICCAI 的年份专用审稿样式可能额外要求匿名设置。')
elsevier = r'''\documentclass[preprint,12pt]{elsarticle}
\usepackage{amsmath,graphicx,booktabs}
\begin{document}
\begin{frontmatter}
\title{LATEX_STUDIO_TITLE}
\author{Author Name}
\affiliation{organization={Institution},city={City},country={Country}}
\begin{abstract}
Write your abstract here.
\end{abstract}
\begin{keyword}
Keyword one \sep Keyword two
\end{keyword}
\end{frontmatter}
''' + body + '\n% \\bibliographystyle{elsarticle-num}\n% \\bibliography{references}\n\\end{document}\n'
make('elsevier', 'Elsevier · elsarticle', 'elsevier', ['Elsevier','Pattern Recognition','Neurocomputing','Information Sciences','Artificial Intelligence','NeuroImage','Journal of Molecular Biology','Journal of Theoretical Biology','Computers in Biology and Medicine'], 'multidisciplinary', elsevier, license='LPPL-1.3', note='采用 elsarticle 的期刊通用起稿；部分 Elsevier 期刊采用 CAS 或其他格式。')
springer = r'''\documentclass[pdflatex,sn-vancouver-num]{sn-jnl}
\usepackage{graphicx,amsmath,booktabs}
\begin{document}
\title{LATEX_STUDIO_TITLE}
\author*[1]{\fnm{Author} \sur{Name}}\email{email@example.com}
\affil*[1]{\orgdiv{Department},\orgname{Institution},\orgaddress{\city{City},\country{Country}}}
\abstract{Write your abstract here.}
\keywords{Keyword one, Keyword two}
\maketitle
''' + body + r'''
\section*{Declarations}
% Add accurate funding, competing interests, ethics and data/code availability statements.
Complete the declarations required by your journal.
% \bibliography{references}
\end{document}
'''
for id,name,aliases in [
 ('springer-nature','Springer Nature · 综合期刊',['Springer','Nature','Nature Communications','Scientific Reports','Scientific Data']),
 ('bmc','BMC / Genome Biology',['BMC','Genome Biology','BMC Bioinformatics','BMC Biology','BMC Genomics','Genome Medicine']),
 ('nature-methods','Nature Methods / Biotechnology',['Nature Methods','Nature Biotechnology','Nature Genetics','Nature Biomedical Engineering'])]:
 make(id,name,'springer',aliases,'biology',springer,note='Springer Nature 官方 content-first 作者模板；这是投稿稿件格式，并非期刊出版排版。遵守目标刊物单独的结构与声明要求。')
with zipfile.ZipFile(cache / 'plos.zip') as z:
    plos_original = z.read('plos_latex_template.tex').decode().replace('\r','')
    plos_preamble = plos_original.split(r'\begin{document}')[0]
plos = plos_preamble + r'''
\begin{document}
\begin{flushleft}
{\Large\textbf{LATEX_STUDIO_TITLE}}\\
Author Name\\
Institution\\
\end{flushleft}
\section*{Abstract}
Write your abstract here.
''' + body + r'''
\section*{Data availability}
% Describe where the underlying data can be accessed.
Complete your data availability statement.
% \bibliography{references}
\end{document}
'''
for id,name,aliases in [
 ('plos-one','PLOS ONE',['PLOS ONE','plosone']),
 ('plos-biology','PLOS Biology / Genetics',['PLOS Biology','PLOS Genetics','PLOS Pathogens','PLOS Medicine']),
 ('plos-computational-biology','PLOS Computational Biology',['PLOS Computational Biology','PLOS CB','计算生物学'])]:
 make(id,name,'plos',aliases,'biology',plos,note='官方 3.8 / Apr 2026 导言区保留。PLOS 要求正文内保留图注、图片单独上传；不要直接套用普通期刊的插图布局。')
oup = r'''\documentclass[unnumsec,webpdf,contemporary,large]{oup-authoring-template}
\usepackage{amsmath,graphicx,booktabs}
\newcommand{\societylogo}{}
\begin{document}
\journaltitle{JOURNAL_NAME}
\DOI{DOI assigned during production}
\copyrightyear{YEAR}
\pubyear{YEAR}
\vol{XX}
\issue{X}
\access{Manuscript under preparation}
\appnotes{Research Article}
\firstpage{1}
\title[LATEX_STUDIO_TITLE]{LATEX_STUDIO_TITLE}
\author[1]{Author Name}
\address[1]{\orgdiv{Department},\orgname{Institution},\orgaddress{\country{Country}}}
\abstract{Write your abstract here.}
\keywords{Keyword one, Keyword two}
\maketitle
''' + body + r'''
\section*{Data availability}
Complete your data availability statement.
% \bibliographystyle{oup-plain}
% \bibliography{references}
\end{document}
'''
for id,name,aliases,journal in [
 ('bioinformatics','Bioinformatics · OUP',['Bioinformatics','ISMB','ECCB','生物信息学'],'Bioinformatics'),
 ('bioinformatics-advances','Bioinformatics Advances',['Bioinformatics Advances'],'Bioinformatics Advances'),
 ('nar-genomics','NAR Genomics and Bioinformatics',['NAR Genomics and Bioinformatics','NARGAB'],'NAR Genomics and Bioinformatics'),
 ('oup-biology','OUP · 生物医学期刊基础格式',['Oxford University Press','OUP','Briefings in Bioinformatics','GigaScience'],'Journal Title')]:
 make(id,name,'oup',aliases,'biology',oup.replace('JOURNAL_NAME',journal),license='LPPL-1.3',note='OUP 官方 authoring template。期刊专属摘要结构、参考文献和版式选项须按指南确认；ISMB/ECCB 仅指采用该期刊格式的论文轨道。')
(target / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Built {len(catalog)} bundled templates')
