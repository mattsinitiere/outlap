from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os, json
F=TTFont('BCEBI.ttf'); gs=F.getGlyphSet(); cmap=F.getBestCmap(); hmtx=F['hmtx']
CAP=700; INK="#0F1218"; COLS=("#7A3FD1","#1D9A5B","#F2B01E")
SL_W=138; SL_SKEW=179; GAP=94
def glyph(ch, x):
    name=cmap[ord(ch)]; pen=SVGPathPen(gs)
    gs[name].draw(TransformPen(pen,(1,0,0,-1,x,0)))
    return pen.getCommands(), hmtx[name][0]
def band(x, y0=-CAP, h=CAP, cols=COLS):
    out=[]
    for i,c in enumerate(cols):
        bx=x+i*SL_W
        out.append(f'<path d="M{bx+SL_SKEW},{y0} L{bx+SL_SKEW+SL_W},{y0} L{bx+SL_W},{y0+h} L{bx},{y0+h} Z" fill="{c}"/>')
    return "".join(out), 3*SL_W+SL_SKEW
def wordmark(fill):
    x=0; parts=[]
    for ch in "OUT":
        d,adv=glyph(ch,x); parts.append(f'<path d="{d}" fill="{fill}"/>'); x+=adv
    x+=GAP-40
    b,bw=band(x); parts.append(b); x+=bw+GAP-48
    for ch in "LAP":
        d,adv=glyph(ch,x); parts.append(f'<path d="{d}" fill="{fill}"/>'); x+=adv
    return "".join(parts), x
pad=40
def svgdoc(body, x0, y0, w, h, extra=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}"{extra}>{body}</svg>\n'
os.makedirs("out", exist_ok=True)
body, W = wordmark(INK)
# tight bounds: letters span roughly 0..W horizontally (italic overhang included by pad), -cap..+overshoot vertically
x0, y0, w, h = -pad, -CAP-pad, W+2*pad+40, CAP+2*pad+20
open("out/outlap-wordmark.svg","w").write(svgdoc(f'<title>OutLap</title>{body}', x0,y0,w,h))
bw_,_=wordmark("#FFFFFF"); open("out/outlap-wordmark-white.svg","w").write(svgdoc(f'<title>OutLap</title>{bw_}', x0,y0,w,h))
b,bwid=band(0); open("out/outlap-mark.svg","w").write(svgdoc(f'<title>OutLap</title>{b}', -10, -CAP-10, bwid+20, CAP+20))
def icon(full_bleed=False, size=512):
    s=0.58 if not full_bleed else 0.44
    bh=size*s; k=bh/CAP; bwid_px=bwid*k
    tx=(size-bwid_px)/2; ty=(size-bh)/2+bh
    rx=0 if full_bleed else size*0.22
    bandg,_=band(0)
    return svgdoc(f'<title>OutLap</title><rect width="{size}" height="{size}" rx="{rx:.1f}" fill="{INK}"/><g transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f})">{bandg}</g>', 0,0,size,size)
open("out/outlap-icon.svg","w").write(icon())
open("out/outlap-icon-maskable.svg","w").write(icon(True))
meta=dict(wordmark_viewbox=[x0,y0,w,h], wordmark_width_units=W, cap=CAP)
json.dump(meta, open("out/meta.json","w"))
print(meta, "band width", bwid)
