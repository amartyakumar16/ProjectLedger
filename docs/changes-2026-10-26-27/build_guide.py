"""Build matching illustrated PDF and editable DOCX guides without changing the app."""
from pathlib import Path
from datetime import datetime, timezone
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED
import json
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent
STEM = 'Phoenix-Engineers-Changes-and-User-Guide-26-27-Oct-2026'
NAVY, TEAL, MUTED = '#172a45', '#0f8a83', '#5f6b7d'
WIDTH, HEIGHT = landscape(A4)
BODY_WIDTH = WIDTH - 84

def p(text): return {'type': 'p', 'text': text}
def steps(*texts): return {'type': 'steps', 'items': list(texts)}
def table(headers, rows, widths=None): return {'type': 'table', 'headers': headers, 'rows': rows, 'widths': widths}
def img(name, caption, width=BODY_WIDTH, max_height=270):
    return {'type': 'image', 'name': name, 'caption': caption, 'width': width, 'max_height': max_height}

PAGES = [
 {'title': 'Recent changes & user guide', 'tag': 'PHOENIX ENGINEERS  /  PROJECTLEDGER', 'blocks': [
   p('Changes delivered on 26-27 October 2026. Prepared on 27 October 2026. This guide explains what changed and how to use the updated PDF-to-Excel review workflow.'),
   table(['Date', 'Changes delivered', 'Guide pages'], [
     ['26 October', 'Phoenix Engineers branding; remaining Silverspace demo references replaced; dashboard helper text removed.', '2'],
     ['26 October', 'Source pages and Review notes columns removed; left/right keyboard navigation added, including Delete.', '3'],
     ['26 October', 'Row selection, project-manager check requests, notifications and Mark as checked buttons.', '4-6'],
     ['27 October', 'Automatic movement from Active Requests to Closed Requests; saved completion history.', '7'],
   ], [85, 575, 97]),
   img('01-sign-in', 'Figure 1. Current sign-in screen showing Phoenix Engineers.', width=335, max_height=192),
   p('Screenshot note: images show the current app using a separate demo session and a sample purchase order. They illustrate the final behavior; they are not historical before/after captures or live company requests.'),
 ]},
 {'title': 'Company name and dashboard cleanup', 'tag': '26 OCTOBER 2026', 'blocks': [
   p('The organization name is now Phoenix Engineers. The change appears on sign-in, in the sidebar and wherever the organization name is used in reports. Existing saved demo data is updated when loaded.'),
   img('02-dashboard', 'Figure 2. Phoenix Engineers in the sidebar; the Committed card no longer shows the removed helper text.', max_height=205),
   table(['Previous display', 'Current behavior'], [
     ['Silverspace', 'Phoenix Engineers'],
     ['Demo emails ending @silverspace.example', 'Demo emails now end @phoenixengineers.example, including saved references.'],
     ['Open POs + approved claims', 'This explanatory text is removed from the Committed dashboard card. The financial calculation remains available.'],
   ], [270, 487]),
   steps('Open http://localhost:5173 and sign in with a demo persona.', 'Check the sidebar company name and the dashboard cards.', 'Refresh an older open session to load the updated branding. A demo-data reset is not required.'),
 ]},
 {'title': 'Cleaner tables and keyboard navigation', 'tag': '26 OCTOBER 2026', 'blocks': [
   p('The entire Source pages and Review notes columns have been removed from the extracted purchase-order item table and its Excel sheet. Other document sheets retain their own Page fields.'),
   img('03-table-start', 'Figure 3. Editable item fields at the beginning of the extracted table.', max_height=94),
   img('04-select-row', 'Figure 4. Right-hand end of the table: Unloading point, Delete and the row-selection checkbox.', max_height=94),
   table(['Key / control', 'Result'], [
     ['Right Arrow', 'Moves to the next box in the same row, even when the text cursor is in the middle of a value.'],
     ['Left Arrow', 'Moves to the previous box in the same row. The table scrolls to show the focused box.'],
     ['End of the data fields', 'Navigation includes the Delete button and the Select for check checkbox, then stops at the row boundary.'],
     ['Enter or Space on Delete', 'Deletes the row. Space on the checkbox selects or clears that row.'],
   ], [170, 587]),
   p('To convert: open PDF to Excel, upload a document, choose recognition settings, then click Read document & create tables. Edit the values and use Download Excel (.xlsx) to keep the tables.'),
 ]},
 {'title': 'Select rows and request a data check', 'tag': '26 OCTOBER 2026', 'blocks': [
   img('05-send-request', 'Figure 5. Request form with a project manager and a precise check instruction.', width=400, max_height=271),
   steps('In an extracted table, select the blank checkbox at the end of each row that needs checking.', 'The Request data check button appears with the selected-row count. Click it.', 'Choose an active project manager. The current requester cannot select themselves.', 'In What should they check?, identify the row, column and value to verify; for example, Quantity 40.000 in row 1.', 'Click Send request. The app saves the selected rows and notifies the chosen manager.'),
   p('Selection is per table and can continue across its pages. Clear selection removes the current selection. The checkbox and Delete controls are app actions, not extra columns in the downloaded workbook.'),
 ]},
 {'title': 'Find and track an active request', 'tag': '26 OCTOBER 2026  /  CURRENT ORGANIZATION OF REQUESTS', 'blocks': [
   img('06-active-request', 'Figure 6. The selected request appears at the top of PDF to Excel, with a top Mark as checked button.', max_height=267),
   steps('After sending, look at Active Requests above the upload area on PDF to Excel.', 'Use View request to reopen its details. The same link is available from its notification.', 'Read the saved rows, requester, assigned project manager, request date, instructions and current status.'),
   p('The request stores the values as they were when sent. Later edits to the conversion table do not silently change that saved snapshot. A reviewer can open the request without keeping the conversion screen open.'),
   p('The requester and assigned project manager can use Mark as checked at the top of the details or beside the request in the list. The following pages show the review and completion steps.'),
 ]},
 {'title': 'Project-manager review and notifications', 'tag': '26 OCTOBER 2026', 'blocks': [
   img('07-manager-notification', 'Figure 7. The assigned manager receives Data check requested in Notifications.', max_height=47),
   img('08-manager-review', 'Figure 8. Manager review with saved rows, review notes and the two result actions.', max_height=255),
   steps('The chosen project manager opens Notifications and clicks Open on the data-check notification.', 'Compare the saved numbers with the source document and add any review notes.', 'Click Mark as checked when verified, or Needs correction with a specific row, column and correction note.'),
   p('The other person receives a result notification. Only the requester and assigned manager can complete the check; only the assigned manager can request corrections.'),
 ]},
 {'title': 'Completed requests move to Closed Requests', 'tag': '27 OCTOBER 2026', 'blocks': [
   img('12-active-and-closed', 'Figure 9. The completed example has left Active Requests and is stored in Closed Requests.', max_height=205),
   steps('Click Mark as checked when the request is done.', 'The request immediately leaves Active Requests and appears under Closed Requests. Open details move there too.', 'In Closed Requests, click View request to inspect the saved rows, instructions, result, completion author and date.'),
   table(['Status', 'Where it appears'], [
     ['Pending / Needs correction', 'Active Requests. Requests needing correction stay active until checked.'],
     ['Checked', 'Closed Requests. This is the app status used by Mark as checked to indicate the request is done.'],
     ['Done / Closed / Completed (if already stored)', 'Closed Requests. Existing completed records are recognized automatically.'],
   ], [260, 497]),
   p('Closed requests are ordered by completion date, newest first. They remain accessible after a page reload; completing a request archives it rather than deleting its saved details.'),
 ]},
 {'title': 'Quick walkthrough and verification', 'tag': 'REFERENCE  /  PREPARED 27 OCTOBER 2026', 'blocks': [
   img('10-requester-result', 'Figure 10. The requester receives the completed check result in Notifications.', max_height=47),
   table(['Check performed', 'Result'], [
     ['Automated project checks', '31 tests passed across five test files; the production build passed.'],
     ['Real browser walkthrough', 'Uploaded the sample PDF; extracted item rows; selected a row; sent a manager request; opened the notification and completed the review.'],
     ['Output and keyboard checks', 'Removed columns absent from the on-screen table and downloaded XLSX; both arrows work from mid-text; Delete and checkbox are reachable.'],
     ['Closure and persistence', 'The completed row moved to Closed Requests; the active list was empty; closed details remained after reload.'],
   ], [185, 572]),
   steps('Requester: convert a PDF, select the relevant rows, choose a project manager, write the check instruction and send.', 'Manager: open Notifications, review the saved rows and mark Checked or request corrections.', 'Requester: read the result notification and find finished items in Closed Requests.'),
   p('Demo scope: requests and notifications are stored in this browser. To try both roles, use Switch user in the same browser. This build does not send email or synchronize requests across devices.'),
   p('Keep your work: conversion-table edits remain in memory while that section is open. Download the Excel file before leaving it. Saved requests preserve selected values, not a shared copy of the original PDF; keep the source document available for comparison.'),
   p('Included example files: sample-purchase-order.pdf and sample-converted-tables.xlsx. Screenshot verification is recorded in capture-verification.json. No existing user data was used or changed to produce this guide.'),
 ]},
]

def image_dimensions(block):
    with PILImage.open(ROOT / 'images' / (block['name'] + '.png')) as pic:
        w, h = pic.size
    scale = min(block['width'] / w, block['max_height'] / h)
    return w * scale, h * scale

def build_pdf():
    for name, filename in [('Calibri', 'calibri.ttf'), ('Calibri-Bold', 'calibrib.ttf'), ('Calibri-Italic', 'calibrii.ttf')]:
        pdfmetrics.registerFont(TTFont(name, 'C:/Windows/Fonts/' + filename))
    styles = {
      'body': ParagraphStyle('body', fontName='Calibri', fontSize=10, leading=13, textColor=colors.HexColor(NAVY), spaceAfter=7),
      'title': ParagraphStyle('title', fontName='Calibri-Bold', fontSize=24, leading=28, textColor=colors.HexColor(NAVY), spaceAfter=12),
      'tag': ParagraphStyle('tag', fontName='Calibri-Bold', fontSize=9, leading=11, textColor=colors.HexColor(TEAL), spaceAfter=7),
      'caption': ParagraphStyle('caption', fontName='Calibri-Italic', fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.HexColor(MUTED), spaceAfter=9),
      'cell': ParagraphStyle('cell', fontName='Calibri', fontSize=9.2, leading=11.6, textColor=colors.HexColor(NAVY)),
      'head': ParagraphStyle('head', fontName='Calibri-Bold', fontSize=9.2, leading=11.6, textColor=colors.white),
    }
    doc = SimpleDocTemplate(str(ROOT / (STEM + '.pdf')), pagesize=(WIDTH, HEIGHT), rightMargin=42, leftMargin=42, topMargin=31, bottomMargin=37,
      title='Phoenix Engineers - Recent Changes and User Guide, 26-27 October 2026', author='Phoenix Engineers')
    flow = []
    for index, page in enumerate(PAGES):
        if index: flow.append(PageBreak())
        flow += [Paragraph(escape(page['tag']), styles['tag']), Paragraph(escape(page['title']), styles['title'])]
        for block in page['blocks']:
            if block['type'] == 'p': flow.append(Paragraph(escape(block['text']), styles['body']))
            elif block['type'] == 'steps':
                for i, text in enumerate(block['items'], 1): flow.append(Paragraph(f'<b>{i}.</b> ' + escape(text), styles['body']))
            elif block['type'] == 'image':
                w, h = image_dimensions(block)
                flow.append(KeepTogether([Image(str(ROOT / 'images' / (block['name'] + '.png')), width=w, height=h), Spacer(1, 5), Paragraph(escape(block['caption']), styles['caption'])]))
            else:
                rows = [[Paragraph(escape(str(v)), styles['head']) for v in block['headers']]] + [[Paragraph(escape(str(v)), styles['cell']) for v in row] for row in block['rows']]
                t = Table(rows, colWidths=block['widths'], hAlign='LEFT', repeatRows=1)
                t.setStyle(TableStyle([('BACKGROUND', (0,0),(-1,0),colors.HexColor(TEAL)), ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f2f7f8'),colors.white]), ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,-1),0.3,colors.HexColor('#dbe4eb'))]))
                flow += [t, Spacer(1, 10)]
    def footer(c, d):
        c.setStrokeColor(colors.HexColor('#dbe4eb')); c.line(42, 29, WIDTH - 42, 29)
        c.setFont('Calibri', 8); c.setFillColor(colors.HexColor(MUTED))
        c.drawString(42, 17, 'PHOENIX ENGINEERS  |  ProjectLedger  |  26-27 October 2026')
        c.drawRightString(WIDTH - 42, 17, f'{d.page} / {len(PAGES)}')
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)

def build_docx():
    # Standard Office Open XML package; all guide text remains editable in Word.
    def para(text, style='Normal', align=None):
        props = f'<w:pStyle w:val="{style}"/>' + (f'<w:jc w:val="{align}"/>' if align else '')
        return f'<w:p><w:pPr>{props}</w:pPr><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    def cell(text, width, header=False):
        shading = '<w:shd w:fill="0F8A83"/>' if header else ''
        return f'<w:tc><w:tcPr><w:tcW w:w="{int(width*20)}" w:type="dxa"/>{shading}</w:tcPr>{para(text,"TableHeader" if header else "TableText")}</w:tc>'
    content, relationships, media = [], [], []
    for n, page in enumerate(PAGES):
        if n: content.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        content += [para(page['tag'], 'Tag'), para(page['title'], 'Title')]
        for block in page['blocks']:
            if block['type'] == 'p': content.append(para(block['text']))
            elif block['type'] == 'steps': content += [para(f'{i}. {text}') for i, text in enumerate(block['items'], 1)]
            elif block['type'] == 'table':
                widths = block['widths'] or [BODY_WIDTH / len(block['headers'])] * len(block['headers'])
                grid = ''.join(f'<w:gridCol w:w="{int(w*20)}"/>' for w in widths)
                rows = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + ''.join(cell(t,w,True) for t,w in zip(block['headers'],widths)) + '</w:tr>'
                rows += ''.join('<w:tr><w:trPr><w:cantSplit/></w:trPr>'+''.join(cell(str(t),w) for t,w in zip(row,widths))+'</w:tr>' for row in block['rows'])
                content.append('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="DBE4EB"/><w:insideH w:val="single" w:sz="3" w:color="DBE4EB"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+grid+'</w:tblGrid>'+rows+'</w:tbl>')
                content.append(para('','Small'))
            else:
                i = len(media) + 1; rid = f'rIdImage{i}'; filename = f'image{i}.png'
                w,h=image_dimensions(block); cx,cy=int(w*12700),int(h*12700)
                relationships.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{filename}"/>')
                media.append((filename, ROOT/'images'/(block['name']+'.png')))
                content.append(f'<w:p><w:pPr><w:jc w:val="center"/><w:keepNext/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{i}" name="Figure {i}" descr="{escape(block["caption"])}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')
                content.append(para(block['caption'],'Caption','center'))
    content.append('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="620" w:right="840" w:bottom="740" w:left="840" w:header="240" w:footer="300"/></w:sectPr>')
    namespaces='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    doc=f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {namespaces}><w:body>{"".join(content)}</w:body></w:document>'
    styles='<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="172A45"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="250" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    for name,size,color,bold in [('Normal',20,'172A45',False),('Title',48,'172A45',True),('Tag',18,'0F8A83',True),('Caption',17,'5F6B7D',False),('TableText',18,'172A45',False),('TableHeader',18,'FFFFFF',True),('Small',8,'5F6B7D',False)]:
        keep='<w:keepNext/>' if name in ['Title','Tag'] else ''
        styles+=f'<w:style w:type="paragraph" w:styleId="{name}"><w:name w:val="{name}"/><w:pPr>{keep}<w:spacing w:after="{40 if name.startswith("Table") else 110}" w:line="{210 if name.startswith("Table") else 250}" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="{size}"/><w:color w:val="{color}"/>{"<w:b/>" if bold else ""}</w:rPr></w:style>'
    styles+='</w:styles>'
    relbase='http://schemas.openxmlformats.org/package/2006/relationships'
    with ZipFile(ROOT/(STEM+'.docx'),'w',ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
        z.writestr('_rels/.rels',f'<Relationships xmlns="{relbase}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        relationships += ['<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>','<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>']
        z.writestr('word/_rels/document.xml.rels',f'<Relationships xmlns="{relbase}">{"".join(relationships)}</Relationships>')
        z.writestr('word/document.xml',doc)
        z.writestr('word/styles.xml',styles)
        z.writestr('word/footer1.xml','<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+para('PHOENIX ENGINEERS  |  ProjectLedger  |  26-27 October 2026','Caption')+'<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>')
        for name,path in media: z.write(path,'word/media/'+name)

if __name__ == '__main__':
    build_pdf(); build_docx()
    (ROOT/'guide-content.json').write_text(json.dumps(PAGES,indent=2),encoding='utf-8')
    print(ROOT/(STEM+'.pdf'))
    print(ROOT/(STEM+'.docx'))
