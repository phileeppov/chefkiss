import type { Glyph, PackId } from '../types'

import { GLYPH_EMOJI } from './logic'

// A pack is only the style of the pictures. Which picture stands on a button is the person's choice of glyph,
// and the meaning (what Claude gets) depends on neither.
export type Pack = {
  id: PackId
  name: string
  // The icon under an answer: an SVG picture or, in text packs, text.
  kind: 'svg' | 'text'
}

const KAOMOJI: Record<Glyph, string> = {
  pinch: '(˘³˘)',
  heart: '(♡‿♡)',
  target: '(⌐■_■)',
  fire: '(ง•_•)ง',
  poop: '(¬_¬)',
  robot: '[•_•]',
}

export const PACKS: Pack[] = [
  { id: 'soft', name: 'Soft 3D', kind: 'svg' },
  { id: 'googly', name: 'Googly', kind: 'svg' },
  { id: 'kaomoji', name: 'Kaomoji', kind: 'text' },
  { id: 'system', name: 'System', kind: 'svg' },
]

export function packOf(id: string | undefined): Pack {
  return PACKS.find(p => p.id === id) ?? (PACKS[0] as Pack)
}

// The glyph as text: on native buttons, in text packs and where no picture is drawn.
export function textOf(pack: Pack, glyph: Glyph): string {
  return pack.id === 'kaomoji' ? KAOMOJI[glyph] : GLYPH_EMOJI[glyph]
}

const HEART =
  'M32 55C17 47 7 37.5 7 25C7 15.5 13.8 9.5 21.5 9.5C26.2 9.5 29.8 12 32 15.8C34.2 12 37.8 9.5 42.5 9.5C50.2 9.5 57 15.5 57 25C57 37.5 47 47 32 55Z'
const POOP = [
  'M9 50.5C9 44 13.5 40.5 19 40.5H45C50.5 40.5 55 44 55 50.5C55 55.5 51 58.5 45.5 58.5H18.5C13 58.5 9 55.5 9 50.5Z',
  'M15 37.5C15 32.5 19 29.5 24 29.5H40C45 29.5 49 32.5 49 37.5C49 41.8 45.8 44 41.5 44H22.5C18.2 44 15 41.8 15 37.5Z',
  'M28.5 20.6C29.6 15.8 32.8 12.8 37.4 11.4C36.2 14.6 36.8 17.8 39.2 20.4Z',
  'M21 26.8C21 22.4 24.5 19.6 28.8 19.6H35.4C39.6 19.6 43 22.2 43 26.5C43 30.2 40.4 32 37 32H27C23.6 32 21 30.4 21 26.8Z',
]
// 🤌: the outline is traced from Fluent Emoji, "Pinched fingers", Flat (https://github.com/microsoft/fluentui-emoji),
// on its own 32-unit grid, the forearm's end rounded; the colours, the velvet, the face and the motion are ours. Its licence:
//
//   MIT License
//
//   Copyright (c) Microsoft Corporation.
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
const PINCH_BACK =
  'M23.2401 2.4C22.8201 2.15 22.3401 2 21.8201 2C20.3501 2 19.1601 3.19 19.1601 4.66C19.1601 5.74 19.8101 6.67 20.7401 7.09C21.0901 7.39 21.6301 7.88 22.1501 8.56C23.2401 9.96 23.7901 11.49 23.7901 13.08C23.7901 15.39 22.6101 17.29 21.6101 18.47C20.1801 20.17 18.4901 21.17 17.4901 21.51C16.1201 21.97 15.3801 23.46 15.8401 24.83C16.2101 25.93 17.2301 26.62 18.3301 26.62C18.6101 26.62 18.8901 26.58 19.1701 26.48C21.4101 25.73 23.8301 23.99 25.6401 21.84C27.2001 19.99 29.0501 16.97 29.0501 13.07C29.0301 6.3 23.4701 2.55 23.2401 2.4Z'
const PINCH_HAND =
  'M22.29 3.88003C21.9 3.64003 21.44 3.50003 20.96 3.48003C19.52 3.44003 18.3 4.57003 18.22 6.00003C18.21 6.15003 18.22 6.29003 18.23 6.44003C17.39 6.58003 16.63 7.08003 16.19 7.88003L10.87 17.03C10.17 18.25 8.87 19 7.46 19H5.6C3.6 19 2 20.6 2 22.6V26.4C2 28.4 3.6 30 5.6 30H10.58C14.3 30 17.95 28.88 20.98 26.72C21.62 26.27 22.25 25.75 22.86 25.17C23.5 24.61 24.11 23.99 24.67 23.33C26.23 21.48 28.08 18.46 28.08 14.56C28.09 7.79003 22.53 4.04003 22.29 3.88003ZM18.03 16.8C18.03 16.56 18.09 16.33 18.21 16.12L21.22 10.67C21.29 10.55 21.34 10.42 21.39 10.3C22.35 11.63 22.83 13.06 22.83 14.56C22.83 14.75 22.82 14.93 22.81 15.12C22.67 16.87 21.19 18.21 19.43 18.21C18.66 18.21 18.03 17.58 18.03 16.8Z'
const PINCH_CREASE =
  'M21.4 10.3C21.9 8.99004 21.37 7.47004 20.1 6.77004C19.51 6.44004 18.85 6.34004 18.25 6.45004L18.25 6.45002C18.24 6.35003 18.23 6.25003 18.23 6.15004C18.23 5.92993 18.2567 5.71609 18.307 5.51159C18.6916 5.46774 19.105 5.47721 19.5441 5.56085C21.0656 5.85064 22.5 7.22028 22.5 9.00004C22.5 10.0269 22.2732 10.9011 22.0801 11.4135C21.8893 11.0352 21.6626 10.6639 21.4 10.3Z'
// Lips for the kiss: an upper lip with its dip and a plumper lower one, under the right eye and tilted toward
// the fingertips the heart flies from. A round mouth would read as surprise next to the target's "o".
const LIPS =
  '<path d="M-3.2 0C-2.4-1.4-1.2-2.3-.3-1.6L0-1.3L.3-1.6C1.2-2.3 2.4-1.4 3.2 0C1.6 .4-1.6 .4-3.2 0Z" fill="#E0456E"/>' +
  '<path d="M-3.2 0C-1.6 .5 1.6 .5 3.2 0C2.6 2 1.4 2.8 0 2.8C-1.4 2.8-2.6 2-3.2 0Z" fill="#CF3460"/><ellipse cx="-.8" cy="1.5" rx=".9" ry=".45" fill="#FF9DB8" opacity=".9"/>'
const PUCKER = `<g transform="translate(40.4 48.4) rotate(-18) scale(1.3)">${LIPS}</g>`
// The fingers curled behind and the crease at the tips are the hand's shade, its own gradient one tone down.
const PINCH = `<g transform="scale(2)"><path d="${PINCH_BACK}" fill="url(#k)"/><path d="${PINCH_HAND}" fill="url(#g)"/><path d="${PINCH_CREASE}" fill="url(#k)"/></g>`
// 🎯: a smaller board low on the left and a big dart from the upper right; its flights stand out past the board's
// edge, and the shaft is thick enough to survive the row's size. Drawn along +x with its tip at 0, then turned.
const BOARD = { x: 28.4, y: 37.6, r: [19.8, 15, 5.6] }
const DART_AT = `translate(${BOARD.x} ${BOARD.y}) rotate(-45)`
const DART =
  '<rect x="13" y="-2" width="13" height="4" rx="2" fill="url(#s)"/>' +
  '<path d="M21 -1.4L26 -8.6H35.5L33 -1.4ZM21 1.4L26 8.6H35.5L33 1.4Z" fill="url(#t)"/>' +
  '<rect x="3" y="-2.8" width="11.5" height="5.6" rx="2.8" fill="url(#m)"/>'
const DART_DEFS =
  '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8F1FF"/><stop offset="1" stop-color="#5DBEF0"/></linearGradient>' +
  '<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FE9FF"/><stop offset=".5" stop-color="#2E8CFF"/><stop offset="1" stop-color="#2350C8"/></linearGradient>' +
  '<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F6F9"/><stop offset=".55" stop-color="#A9B1C2"/><stop offset="1" stop-color="#5D667A"/></linearGradient>'
// 🤖: a head with ears and an antenna, a dark face plate with glowing eyes.
const ANTENNA = '<rect x="30.9" y="11" width="2.2" height="11" rx="1.1" fill="#5D667A"/><circle cx="32" cy="9.6" r="4.3" fill="url(#a)"/>'
const HEAD =
  '<rect x="6.5" y="32" width="6" height="13" rx="3"/><rect x="51.5" y="32" width="6" height="13" rx="3"/><rect x="10.5" y="20.5" width="43" height="35" rx="11.5"/>'
const PLATE = '<rect x="16.5" y="27" width="31" height="22" rx="8" fill="url(#p)"/>'
const ROBOT_DEFS =
  '<radialGradient id="a" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFD0DC"/><stop offset=".5" stop-color="#FF5A86"/><stop offset="1" stop-color="#C2245A"/></radialGradient>' +
  '<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#363D5C"/><stop offset="1" stop-color="#1B1F30"/></linearGradient>'
const GLOW_EYE = '#7DF3FF'

// Appear morph: a drop, stretched, overshoots the shape, settles. Paths of one structure.
const HEART_MORPH = [
  'M32.0 44.4C25.9 41.7 23.3 37.5 23.4 33.2C24.3 30.5 26.2 28.4 28.3 27.5C29.8 27.1 31.1 27.1 32.0 27.3C32.9 27.1 34.2 27.1 35.7 27.5C37.8 28.4 39.7 30.5 40.6 33.2C40.7 37.5 38.1 41.7 32.0 44.4Z',
  'M32.0 49.1C22.5 43.5 18.3 34.9 18.5 25.9C20.0 20.3 23.0 16.1 26.2 14.1C28.6 13.2 30.5 13.2 32.0 13.7C33.5 13.2 35.4 13.2 37.8 14.1C41.0 16.1 44.0 20.3 45.5 25.9C45.7 34.9 41.5 43.5 32.0 49.1Z',
  'M32.0 55.8C16.5 47.5 5.9 37.7 5.9 24.7C5.7 14.6 12.9 8.4 21.1 8.6C26.0 8.7 29.7 11.5 32.0 15.7C34.3 11.5 38.0 8.7 42.9 8.6C51.1 8.4 58.3 14.6 58.1 24.7C58.1 37.7 47.5 47.5 32.0 55.8Z',
  'M32.0 55.0C17.0 47.0 7.0 37.5 7.0 25.0C7.0 15.5 13.8 9.5 21.5 9.5C26.2 9.5 29.8 12.0 32.0 15.8C34.2 12.0 37.8 9.5 42.5 9.5C50.2 9.5 57.0 15.5 57.0 25.0C57.0 37.5 47.0 47.0 32.0 55.0Z',
]
// 🔥: the flame and its appear morph, of one structure.
const FIRE =
  'M32 58C19.5 58 12 50 12 40C12 31.5 16.5 26.5 19.5 21C20.6 25 23 27.5 25.5 28.6C25 20.6 29.5 12.8 36 8.5C35.6 15 39.2 19.2 42.6 22.2C44 19.8 44.6 17 44.4 14C49.4 19.2 52 27.6 52 38.6C52 50 44.5 58 32 58Z'
const FIRE_MORPH = [
  'M32.0 49.7C27.6 48.6 24.9 45.9 23.9 42.4C24.2 39.1 25.5 36.8 27.2 35.0C26.8 35.7 27.0 35.8 27.7 35.4C29.0 34.2 31.2 33.2 33.2 33.0C33.3 33.4 34.9 34.0 36.5 34.9C36.5 34.7 36.3 34.4 35.9 34.0C37.8 35.4 39.3 37.8 40.1 41.8C39.1 45.9 36.4 48.6 32.0 49.7Z',
  'M32.0 53.6C25.1 51.5 20.8 45.8 19.4 38.6C19.9 31.6 21.9 27.0 24.4 23.2C23.8 24.6 24.2 24.8 25.3 24.0C27.4 21.5 30.7 19.4 33.8 19.0C34.0 19.9 36.6 21.1 39.0 23.1C39.1 22.6 38.8 21.9 38.1 21.1C41.0 24.0 43.4 29.0 44.6 37.3C43.2 45.8 38.9 51.5 32.0 53.6Z',
  'M32.0 58.6C19.0 58.9 11.2 50.5 11.4 40.1C11.3 31.3 16.1 26.2 19.1 20.4C20.4 24.7 23.0 27.5 25.7 28.8C24.8 20.1 29.4 11.6 36.2 6.8C35.8 14.0 39.4 18.6 42.9 21.8C44.5 19.1 45.2 16.1 45.0 12.8C50.2 18.3 52.8 27.2 52.6 38.6C52.8 50.5 45.0 58.9 32.0 58.6Z',
  'M32.0 58.0C19.5 58.0 12.0 50.0 12.0 40.0C12.0 31.5 16.5 26.5 19.5 21.0C20.6 25.0 23.0 27.5 25.5 28.6C25.0 20.6 29.5 12.8 36.0 8.5C35.6 15.0 39.2 19.2 42.6 22.2C44.0 19.8 44.6 17.0 44.4 14.0C49.4 19.2 52.0 27.6 52.0 38.6C52.0 50.0 44.5 58.0 32.0 58.0Z',
]

const VELVET =
  '<filter id="v" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur in="SourceGraphic" stdDeviation=".7" result="s"/><feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1" result="g"/><feBlend in="g" in2="s" mode="soft-light" result="b"/><feComposite in="b" in2="s" operator="in"/></filter>'
const GRAIN =
  '<filter id="r" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1" result="g"/><feBlend in="g" in2="SourceGraphic" mode="soft-light" result="b"/><feComposite in="b" in2="SourceAlpha" operator="in"/></filter>'
const EYE_SHADOW =
  '<filter id="e" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="1.1" stdDeviation=".7" flood-color="#000" flood-opacity=".24"/></filter>'

const SOFT_FILL: Record<Glyph, string> = {
  pinch:
    '<radialGradient id="g" cx=".42" cy=".22" r=".95"><stop offset="0" stop-color="#FFF1BE"/><stop offset=".45" stop-color="#FFD447"/><stop offset=".8" stop-color="#F5AC2C"/><stop offset="1" stop-color="#E0861A"/></radialGradient>' +
    '<radialGradient id="k" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="#F7C04A"/><stop offset=".6" stop-color="#E29B2A"/><stop offset="1" stop-color="#C27A18"/></radialGradient>',
  heart: '<radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#FFD9E4"/><stop offset=".5" stop-color="#FF7098"/><stop offset="1" stop-color="#B3247B"/></radialGradient>',
  target:
    '<radialGradient id="g" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="#FFB0A8"/><stop offset=".5" stop-color="#F5475A"/><stop offset="1" stop-color="#B01D45"/></radialGradient>' +
    '<radialGradient id="w" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F7EFEF"/><stop offset="1" stop-color="#D9C8CC"/></radialGradient>' +
    DART_DEFS,
  fire: '<radialGradient id="g" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="#FFF4B0"/><stop offset=".4" stop-color="#FFB53A"/><stop offset=".75" stop-color="#FF5A3E"/><stop offset="1" stop-color="#C42A78"/></radialGradient>',
  poop: '<radialGradient id="g" cx=".36" cy=".25" r=".9"><stop offset="0" stop-color="#F4CE9E"/><stop offset=".5" stop-color="#B5793F"/><stop offset="1" stop-color="#6C391B"/></radialGradient>',
  robot:
    '<radialGradient id="g" cx=".36" cy=".28" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#CCD5E6"/><stop offset=".8" stop-color="#8592AE"/><stop offset="1" stop-color="#56607C"/></radialGradient>' +
    ROBOT_DEFS,
}

const FLAT_FILL: Record<Glyph, string> = {
  pinch:
    '<linearGradient id="g" x1=".2" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#FFE07A"/><stop offset=".55" stop-color="#FFC234"/><stop offset="1" stop-color="#EE9420"/></linearGradient>' +
    '<linearGradient id="k" x1=".2" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#F2B23E"/><stop offset="1" stop-color="#D68A1E"/></linearGradient>',
  heart: '<linearGradient id="g" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#FFB3CB"/><stop offset=".5" stop-color="#FF4F7E"/><stop offset="1" stop-color="#C81E8C"/></linearGradient>',
  target:
    '<linearGradient id="g" x1=".1" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FF8F8F"/><stop offset=".5" stop-color="#F23B52"/><stop offset="1" stop-color="#B8164A"/></linearGradient>' +
    '<linearGradient id="w" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E8DCDF"/></linearGradient>' +
    DART_DEFS,
  fire: '<linearGradient id="g" x1="0" y1="0" x2=".15" y2="1"><stop offset="0" stop-color="#FFE45C"/><stop offset=".45" stop-color="#FF9A1F"/><stop offset=".82" stop-color="#FF3B4E"/><stop offset="1" stop-color="#D21F7A"/></linearGradient>',
  poop: '<linearGradient id="g" x1="0" y1="10" x2="20" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#CF9A69"/><stop offset=".6" stop-color="#93582E"/><stop offset="1" stop-color="#673318"/></linearGradient>',
  robot:
    '<linearGradient id="g" x1=".1" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#F6F8FC"/><stop offset=".55" stop-color="#BAC5D9"/><stop offset="1" stop-color="#7C88A5"/></linearGradient>' +
    ROBOT_DEFS,
}

// Soft 3D faces: blissful, in love, pleased with the hit, fired up, "meh" and a bored robot.
const SOFT_FACE: Record<Glyph, string> = {
  pinch:
    '<ellipse cx="27" cy="48.6" rx="3" ry="1.9" fill="#FF9C8A" opacity=".6"/><ellipse cx="46.6" cy="45.8" rx="2.8" ry="1.9" fill="#FF9C8A" opacity=".6"/><path d="M27.2 43q3.45-3.7 6.9 0M37.8 41.8q3.45-3.7 6.9 0" fill="none" stroke="#141413" stroke-width="2.6" stroke-linecap="round"/>' +
    PUCKER,
  heart:
    '<ellipse cx="19.5" cy="34.5" rx="3.2" ry="2" fill="#FF9CC0" opacity=".75"/><ellipse cx="44.5" cy="34.5" rx="3.2" ry="2" fill="#FF9CC0" opacity=".75"/><path d="M23.8 28.6q2.7-3 5.4 0M34.8 28.6q2.7-3 5.4 0M28.2 33.6q3.8 3.4 7.6 0" fill="none" stroke="#141413" stroke-width="2.5" stroke-linecap="round"/>',
  // On the white ring alone: eyes up on the dart, a small smile. Got it, not ouch.
  target:
    '<g fill="#fff" stroke="#C9B6BB" stroke-width=".7"><ellipse cx="24.2" cy="45.4" rx="2.5" ry="2.9"/><ellipse cx="32.6" cy="45.4" rx="2.5" ry="2.9"/></g><circle cx="25.1" cy="44.4" r="1.6" fill="#141413"/><circle cx="33.5" cy="44.4" r="1.6" fill="#141413"/><path d="M25.8 49.6q2.6 2.2 5.2 0" fill="none" stroke="#141413" stroke-width="2" stroke-linecap="round"/>',
  // Fired up: eyes set with resolve, a wide open smile.
  fire:
    '<path d="M23.6 37.2L28.8 38.2C28.8 40.8 27.6 42.4 26.2 42.4C24.8 42.4 23.6 40.8 23.6 37.2ZM40.4 37.2L35.2 38.2C35.2 40.8 36.4 42.4 37.8 42.4C39.2 42.4 40.4 40.8 40.4 37.2Z" fill="#141413"/><circle cx="25.4" cy="39.6" r=".75" fill="#fff"/><circle cx="37" cy="39.6" r=".75" fill="#fff"/><path d="M26.6 45h10.8q0 5.6-5.4 5.6t-5.4-5.6Z" fill="#141413"/><ellipse cx="32" cy="48.6" rx="2.6" ry="1.3" fill="#FF7A86"/>',
  poop: '<g class="eh"><path d="M23.6 37.4a2.7 2.7 0 0 0 5.4 0ZM35 37.4a2.7 2.7 0 0 0 5.4 0Z" fill="#141413"/></g><path d="M22.8 37.4h7M34.2 37.4h7M28 44.4q2-1.4 4 0t4 0" fill="none" stroke="#141413" stroke-width="2.2" stroke-linecap="round"/>',
  robot:
    `<g class="ey"><g class="eh"><path d="M21.6 36.4a3.4 3.4 0 0 0 6.8 0ZM35.6 36.4a3.4 3.4 0 0 0 6.8 0Z" fill="${GLOW_EYE}"/></g><path d="M20.8 36.4h8.4M34.8 36.4h8.4M27.6 43.4q2.2-1.5 4.4 0t4.4 0" fill="none" stroke="${GLOW_EYE}" stroke-width="2" stroke-linecap="round"/></g>`,
}

// Shared keyframes: fade in, pop, a drop that lands, a "meh" blink.
const KEYS = [
  '@keyframes fi{0%{opacity:0}100%{opacity:1}}',
  '@keyframes fc{0%{transform:scale(.4);opacity:0}100%{transform:none;opacity:1}}',
  '@keyframes dr{0%{transform:translateY(-16px) scale(.9,1.1);opacity:0}55%{transform:translateY(1px) scale(1.12,.86);opacity:1}100%{transform:none}}',
  '@keyframes mh{0%,100%{transform:none}45%,60%{transform:scaleY(.15)}}',
]
const FACE_IN = '.f{transform-box:fill-box;transform-origin:50% 50%;animation:fc .32s .56s cubic-bezier(.2,.9,.3,1.5) both}'
const BLINK = '.eh{transform-box:fill-box;transform-origin:50% 0;animation:mh .55s .9s ease-in-out both}'

const SOFT_ANIM: Record<Glyph, string[]> = {
  // The hand pops up, gives the shake from the wrist, and a little kiss flies off the fingertips.
  pinch: [
    '.po,.pq,.kh{transform-box:fill-box}',
    '.po{transform-origin:50% 80%;animation:fc .34s cubic-bezier(.2,.9,.3,1.5) both}',
    '.pq{transform-origin:20% 85%;animation:pq .6s .5s ease-in-out both}',
    '.kh{transform-origin:50% 50%;animation:kp .9s .72s ease-out both}',
    FACE_IN,
    '@keyframes pq{0%,100%{transform:none}30%{transform:rotate(-7deg)}65%{transform:rotate(4deg)}}',
    '@keyframes kp{0%{transform:translate(3px,4px) scale(0);opacity:0}25%{transform:none;opacity:1}100%{transform:translate(-4px,-5px) scale(.9);opacity:0}}',
  ],
  heart: [
    '.m,.b{transform-box:fill-box}',
    '.m{transform-origin:50% 70%;animation:fi .12s both}',
    '.b{transform-origin:50% 60%;animation:bt .7s .82s ease-in-out both}',
    FACE_IN,
    '@keyframes bt{0%,100%{transform:none}20%{transform:scale(1.07)}40%{transform:scale(.98)}62%{transform:scale(1.04)}82%{transform:scale(.995)}}',
  ],
  // The board pops up, the dart flies in and sticks with a wobble, the board takes the hit.
  target: [
    '.po,.tb,.dt,.dw{transform-box:fill-box}',
    '.po{transform-origin:50% 50%;animation:fc .32s cubic-bezier(.2,.9,.3,1.5) both}',
    '.tb{transform-origin:50% 50%;animation:th .34s .66s ease-out both}',
    '.dt{animation:df .26s .42s cubic-bezier(.5,0,.9,.6) both}',
    '.dw{transform-origin:0 50%;animation:wb .6s .68s ease-out both}',
    FACE_IN,
    '@keyframes df{0%{transform:translateX(26px);opacity:0}30%{opacity:1}100%{transform:none;opacity:1}}',
    '@keyframes th{0%,100%{transform:none}35%{transform:scale(1.05,.95)}70%{transform:scale(.985,1.015)}}',
    '@keyframes wb{0%,100%{transform:none}20%{transform:rotate(-7deg)}45%{transform:rotate(5deg)}70%{transform:rotate(-2.5deg)}}',
  ],
  // The flame grows out of a drop, then flickers.
  fire: [
    '.m,.k{transform-box:fill-box}',
    '.m{transform-origin:50% 70%;animation:fi .12s both}',
    '.k{transform-origin:50% 100%;animation:fk .62s .76s ease-in-out both}',
    FACE_IN,
    '@keyframes fk{0%,100%{transform:none}30%{transform:skewX(-4deg) scaleY(1.05)}65%{transform:skewX(3deg) scaleY(.98)}}',
  ],
  poop: [
    '.d{transform-box:fill-box;transform-origin:50% 100%;animation:dr .42s cubic-bezier(.3,.7,.3,1.35) both}',
    '.d2{animation-delay:.09s}.d3{animation-delay:.18s}.d4{animation-delay:.27s}',
    FACE_IN,
    BLINK,
  ],
  // The robot drops in, the antenna springs, the eyes switch on and droop.
  robot: [
    '.d,.an,.ey{transform-box:fill-box}',
    '.d{transform-origin:50% 100%;animation:dr .42s cubic-bezier(.3,.7,.3,1.35) both}',
    '.an{transform-origin:50% 100%;animation:an .7s .3s ease-in-out both}',
    '.ey{animation:pw .5s .36s linear both}',
    BLINK,
    '@keyframes an{0%,100%{transform:none}25%{transform:rotate(-14deg)}50%{transform:rotate(9deg)}75%{transform:rotate(-4deg)}}',
    '@keyframes pw{0%,30%{opacity:0}40%{opacity:1}50%{opacity:.2}60%,100%{opacity:1}}',
  ],
}

function morphCss(name: string, steps: string[]): string {
  return `@keyframes ${name}{0%{d:path("${steps[0]}")}38%{d:path("${steps[1]}")}72%{d:path("${steps[2]}")}100%{d:path("${steps[3]}")}}.${name}{animation:${name} .74s cubic-bezier(.45,0,.25,1) both}`
}

type Drawing = { defs: string; body: string; css: string }

function softBody(glyph: Glyph, animated: boolean): string {
  const face = animated ? `<g class="f">${SOFT_FACE[glyph]}</g>` : SOFT_FACE[glyph]
  switch (glyph) {
    case 'pinch': {
      const bud = `<g filter="url(#v)">${PINCH}</g>`
      if (!animated) return bud + face
      const kiss = `<g class="kh"><path transform="translate(45 -2) scale(.13)" d="${HEART}" fill="#FF5F8F"/></g>`
      return `<g class="po"><g class="pq">${bud}</g>${face}</g>${kiss}`
    }
    case 'heart': {
      const path = `<path${animated ? ' class="mh2"' : ''} d="${HEART}" fill="url(#g)"/>`
      return animated ? `<g class="b"><g class="m"><g filter="url(#v)">${path}</g></g>${face}</g>` : `<g filter="url(#v)">${path}</g>${face}`
    }
    case 'fire': {
      const path = `<path${animated ? ' class="mf2"' : ''} d="${FIRE}" fill="url(#g)"/>`
      return animated ? `<g class="k"><g class="m"><g filter="url(#v)">${path}</g></g>${face}</g>` : `<g filter="url(#v)">${path}</g>${face}`
    }
    case 'target': {
      const { x, y, r } = BOARD
      const rings = `<g filter="url(#v)"><circle cx="${x}" cy="${y}" r="${r[0]}" fill="url(#g)"/><circle cx="${x}" cy="${y}" r="${r[1]}" fill="url(#w)"/><circle cx="${x}" cy="${y}" r="${r[2]}" fill="url(#g)"/></g>`
      const hole = `<ellipse cx="${x + 1}" cy="${y - 1}" rx="2" ry="1.3" fill="#000" opacity=".25"/>`
      if (!animated) return `${rings}${face}${hole}<g transform="${DART_AT}">${DART}</g>`
      return `<g class="tb"><g class="po">${rings}${hole}</g>${face}</g><g transform="${DART_AT}"><g class="dt"><g class="dw">${DART}</g></g></g>`
    }
    case 'poop': {
      const tiers = POOP.map((d, i) => {
        const cls = animated ? ` class="d${i === 0 ? '' : ` d${[0, 2, 4, 3][i]}`}"` : ''
        return `<path${cls} d="${d}"/>`
      }).join('')
      return `<g filter="url(#v)" fill="url(#g)">${tiers}</g>${face}`
    }
    case 'robot': {
      const antenna = animated ? `<g class="an">${ANTENNA}</g>` : ANTENNA
      const robot = `${antenna}<g filter="url(#v)" fill="url(#g)">${HEAD}</g>${PLATE}${SOFT_FACE.robot}`
      return animated ? `<g class="d">${robot}</g>` : robot
    }
  }
}

// A drawing brought to the set's weight: the silhouette's area and centre as the heart's and the poop's.
// The target is scaled up: its thin dart weighs nothing to the eye, and the board alone looked the smallest of the set.
const FIT: Partial<Record<Glyph, string>> = { pinch: 'matrix(.955 0 0 .955 .4 1)', target: 'matrix(1.08 0 0 1.08 -2.56 -2.72)' }
const fitted = (glyph: Glyph, body: string) => (FIT[glyph] ? `<g transform="${FIT[glyph]}">${body}</g>` : body)

function soft(glyph: Glyph, animated: boolean): Drawing {
  const css = !animated ? '' : SOFT_ANIM[glyph].join('') + KEYS.join('') + (glyph === 'heart' ? morphCss('mh2', HEART_MORPH) : glyph === 'fire' ? morphCss('mf2', FIRE_MORPH) : '')
  return { defs: VELVET + SOFT_FILL[glyph], body: fitted(glyph, softBody(glyph, animated)), css }
}

// Googly eyes: whites and pupils, the size of the poop's (the heart's are bigger). On 💩 and 🤖 the eyes look
// in different directions, on 🎯 at the dart. Googly faces are eyes only, no mouths.
const GOOGLY: Record<Glyph, { eyes: [number, number, number][]; pupils: [number, number, number][] }> = {
  pinch: { eyes: [[29.2, 44.6, 5.8], [41, 43.4, 5.8]], pupils: [[30, 43.4, 3.1], [41.8, 42.2, 3.1]] },
  heart: { eyes: [[24, 29, 6.8], [40, 29, 6.8]], pupils: [[25.6, 27.4, 3.5], [41.6, 27.4, 3.5]] },
  target: { eyes: [[22.4, 45.2, 5.8], [34.6, 45.2, 5.8]], pupils: [[23.8, 43.8, 3.1], [36, 43.8, 3.1]] },
  fire: { eyes: [[25.4, 41.6, 5.8], [38.6, 41.6, 5.8]], pupils: [[26.2, 40.4, 3.1], [39.4, 40.4, 3.1]] },
  poop: { eyes: [[25.6, 37, 5.8], [38.4, 37, 5.8]], pupils: [[23.4, 38.4, 3.1], [40.6, 35, 3.1]] },
  robot: { eyes: [[25, 37, 5.8], [39, 37, 5.8]], pupils: [[23, 38.4, 3.1], [41, 35.2, 3.1]] },
}

const GOOGLY_ANIM = [
  '.s,.u{transform-box:fill-box}',
  '.s{transform-origin:50% 90%;animation:sq .62s cubic-bezier(.3,.7,.3,1.3) both}',
  '.u{animation:jg .9s .18s cubic-bezier(.3,.6,.4,1) both}',
  '.u2{animation-delay:.24s}',
  '@keyframes sq{0%{transform:scale(.5,.35);opacity:0}28%{transform:scale(1.18,.84);opacity:1}50%{transform:scale(.92,1.08)}72%{transform:scale(1.03,.98)}100%{transform:none}}',
  '@keyframes jg{0%{transform:none}14%{transform:translate(3.2px,-2.2px)}28%{transform:translate(-2.6px,1.8px)}42%{transform:translate(1.9px,-1.1px)}56%{transform:translate(-1.1px,.7px)}72%{transform:translate(.5px,-.3px)}100%{transform:none}}',
]

// The flat shape under the googly eyes, and what lies on it before the eyes.
function googlyShape(glyph: Glyph): string {
  switch (glyph) {
    case 'pinch':
      return `<g filter="url(#r)">${PINCH}</g>`
    case 'heart':
      return `<g filter="url(#r)" fill="url(#g)"><path d="${HEART}"/></g>`
    case 'fire':
      return `<g filter="url(#r)" fill="url(#g)"><path d="${FIRE}"/></g>`
    case 'target': {
      const { x, y, r } = BOARD
      return `<g filter="url(#r)"><circle cx="${x}" cy="${y}" r="${r[0]}" fill="url(#g)"/><circle cx="${x}" cy="${y}" r="${r[1]}" fill="url(#w)"/><circle cx="${x}" cy="${y}" r="${r[2]}" fill="url(#g)"/></g><g transform="${DART_AT}">${DART}</g>`
    }
    case 'poop':
      return `<g filter="url(#r)" fill="url(#g)">${POOP.map(d => `<path d="${d}"/>`).join('')}</g>`
    case 'robot':
      return `${ANTENNA}<g filter="url(#r)" fill="url(#g)">${HEAD}</g>${PLATE}<path d="M27.6 45q2.2-1.5 4.4 0t4.4 0" fill="none" stroke="${GLOW_EYE}" stroke-width="2" stroke-linecap="round"/>`
  }
}

function googly(glyph: Glyph, animated: boolean): Drawing {
  const defs = GRAIN + EYE_SHADOW + FLAT_FILL[glyph]
  const g = GOOGLY[glyph]
  // On the white of the board the eye needs an edge to be seen.
  const edge = glyph === 'target' ? ' stroke="rgba(0,0,0,.18)" stroke-width=".8"' : ''
  const eyes = g.eyes.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"${edge}/>`).join('')
  const pupils = g.pupils
    .map(([x, y, r], i) => `<circle${animated ? ` class="u${i ? ' u2' : ''}"` : ''} cx="${x}" cy="${y}" r="${r}" fill="#111"/>`)
    .join('')
  // Pupils in their own group: the hover "look" does not interrupt their appear animation.
  const inner = fitted(glyph, `${googlyShape(glyph)}<g filter="url(#e)">${eyes}</g><g class="lk">${pupils}</g>`)
  return { defs, body: animated ? `<g class="s">${inner}</g>` : inner, css: animated ? GOOGLY_ANIM.join('') : '' }
}

// Every animation delay is shifted by --t, the time since the reaction was placed.
// If the app redraws the picture mid-animation, it continues from the same spot instead of starting over.
// The shorthand is parsed whole: its second time is the delay wherever it stands, with or without easing.
export function shifted(css: string): string {
  const time = /^[\d.]+m?s$/
  return css
    .replace(/animation:([^;}]*)/g, (_m, body: string) => {
      const parts = body.trim().split(/\s+/)
      let seen = 0
      let at = -1
      parts.forEach((p, i) => {
        if (time.test(p) && ++seen === 2) at = i
      })
      const delay = at >= 0 ? parts[at] : '0s'
      return `animation:${parts.filter((_, i) => i !== at).join(' ')};animation-delay:calc(${delay} - var(--t,0s))`
    })
    .replace(/\{animation-delay:([\d.]+m?s)\}/g, '{animation-delay:calc($1 - var(--t,0s))}')
}

// Hover response: the icon comes alive with a short move in its own character, the capsule lightens.
const HOVER: Record<Glyph, string> = {
  pinch: '@keyframes hv{0%,100%{transform:none}20%{transform:translateY(-1.5px) rotate(-6deg)}45%{transform:rotate(4deg)}70%{transform:translateY(-.8px) rotate(-3deg)}}',
  heart: '@keyframes hv{0%,100%{transform:none}25%{transform:scale(1.14)}50%{transform:scale(.96)}75%{transform:scale(1.04)}}',
  target: '@keyframes hv{0%,100%{transform:none}30%{transform:scale(1.06,.94)}60%{transform:scale(.97,1.03)}}',
  fire: '@keyframes hv{0%,100%{transform:none}30%{transform:skewX(-6deg) scaleY(1.08)}65%{transform:skewX(4deg) scaleY(.97)}}',
  poop: '@keyframes hv{0%,100%{transform:none}25%{transform:scale(1.12,.88)}50%{transform:scale(.94,1.06)}75%{transform:scale(1.03,.98)}}',
  robot: '@keyframes hv{0%,100%{transform:none}25%{transform:rotate(-6deg)}55%{transform:rotate(4deg)}80%{transform:rotate(-1.5deg)}}',
}
const HOVER_CSS = [
  '.hv{transform-box:fill-box;transform-origin:50% 75%}',
  'svg:hover .hv{animation:hv .6s cubic-bezier(.3,.7,.3,1.3)}',
  '.cap{transition:fill .2s,stroke .2s}',
  'svg:hover .cap{fill:rgba(128,128,128,.24);stroke:rgba(128,128,128,.52)}',
  '.lk{transform-box:fill-box}',
  'svg:hover .lk{animation:look .9s ease-in-out}',
  '@keyframes look{0%,100%{transform:none}30%{transform:translate(2px,-1.6px)}65%{transform:translate(-1.6px,1px)}}',
].join('')

// Live copy of the icon: it sits on top of the icon while the cursor is on it and repeats the same move
// with a pause, so the icon breathes while it is looked at. The capsule is a bit lighter, as under hover.
const ALIVE: Record<Glyph, string> = {
  pinch: '@keyframes hl{0%,40%,100%{transform:none}8%{transform:translateY(-1.5px) rotate(-6deg)}18%{transform:rotate(4deg)}28%{transform:translateY(-.8px) rotate(-3deg)}}',
  heart: '@keyframes hl{0%,40%,100%{transform:none}10%{transform:scale(1.14)}20%{transform:scale(.96)}30%{transform:scale(1.04)}}',
  target:
    '@keyframes hl{0%,40%,100%{transform:none}12%{transform:scale(1.06,.94)}24%{transform:scale(.97,1.03)}}.dw{animation:wl 1.5s ease-out infinite}@keyframes wl{0%,40%,100%{transform:none}8%{transform:rotate(-7deg)}18%{transform:rotate(5deg)}28%{transform:rotate(-2.5deg)}}',
  fire: '@keyframes hl{0%,40%,100%{transform:none}12%{transform:skewX(-6deg) scaleY(1.08)}26%{transform:skewX(4deg) scaleY(.97)}}',
  poop: '@keyframes hl{0%,40%,100%{transform:none}10%{transform:scale(1.12,.88)}20%{transform:scale(.94,1.06)}30%{transform:scale(1.03,.98)}}',
  robot:
    '@keyframes hl{0%,40%,100%{transform:none}10%{transform:rotate(-6deg)}22%{transform:rotate(4deg)}32%{transform:rotate(-1.5deg)}}.an{animation:al 1.5s ease-in-out infinite}@keyframes al{0%,40%,100%{transform:none}10%{transform:rotate(-14deg)}20%{transform:rotate(9deg)}30%{transform:rotate(-4deg)}}',
}
const ALIVE_CSS = [
  '.hv{transform-box:fill-box;transform-origin:50% 75%;animation:hl 1.5s cubic-bezier(.3,.7,.3,1.3) infinite}',
  '.cap{fill:rgba(128,128,128,.24);stroke:rgba(128,128,128,.52)}',
  '.lk{transform-box:fill-box;animation:look 1.5s ease-in-out infinite}',
  '@keyframes look{0%,60%,100%{transform:none}20%{transform:translate(2px,-1.6px)}40%{transform:translate(-1.6px,1px)}}',
].join('')

// An icon at rest is the same markup wound forward 9 s: every animation is already on its last frame.
// So the resting picture is the same on any redraw, and the switch from animated to static does not flicker.
const SETTLED_MS = 9000

export type IconOptions = {
  // Milliseconds since the reaction was placed; unset means the icon is at rest.
  elapsed?: number
  // The icon in a capsule that responds to hover, as under an answer.
  capsule?: boolean
  // Live copy of the icon under the cursor: a looping move, a lighter capsule.
  alive?: boolean
}

// The System pack: the system's own emoji, drawn as text inside the picture, so it gets the row's size, its frame
// and a pop when placed, like the drawn packs. The terminal draws no pictures and shows the emoji as text.
const EMOJI_FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"
function systemEmoji(glyph: Glyph, animated: boolean): Drawing {
  const text = `<text x="32" y="34" text-anchor="middle" dominant-baseline="central" font-size="48" font-family="${EMOJI_FONT}">${GLYPH_EMOJI[glyph]}</text>`
  if (!animated) return { defs: '', body: text, css: '' }
  return {
    defs: '',
    body: `<g class="po">${text}</g>`,
    css: '.po{transform-box:fill-box;transform-origin:50% 60%;animation:fc .34s cubic-bezier(.2,.9,.3,1.5) both}' + KEYS.join(''),
  }
}

function drawingOf(pack: Pack, glyph: Glyph, animated = true): Drawing | null {
  if (pack.id === 'soft') return soft(glyph, animated)
  if (pack.id === 'googly') return googly(glyph, animated)
  return pack.id === 'system' ? systemEmoji(glyph, animated) : null
}

// The icon picture; an empty string for text packs.
export function iconSvg(pack: Pack, glyph: Glyph, options: IconOptions = {}): string {
  const drawing = drawingOf(pack, glyph)
  if (!drawing) return ''
  const elapsed = options.elapsed !== undefined && Number.isFinite(options.elapsed) ? Math.max(0, options.elapsed) : SETTLED_MS
  const t = `${(Math.min(elapsed, SETTLED_MS) / 1000).toFixed(2)}s`
  const motion = shifted(drawing.css)
  if (!options.capsule) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" style="--t:${t}"><style>${motion}</style><defs>${drawing.defs}</defs>${drawing.body}</svg>`
  }
  // Capsule: translucent so it holds on both light and dark themes; a 0.5px edge and a highlight on top.
  const cap =
    '<rect class="cap" x="1.5" y="1.5" width="93" height="61" rx="30.5" fill="rgba(128,128,128,.13)" stroke="rgba(128,128,128,.34)" stroke-width="1.2"/>' +
    '<path d="M32 3.6H64" stroke="rgba(255,255,255,.22)" stroke-width="1.2" stroke-linecap="round"/>'
  const style = options.alive ? `<style>${motion}${ALIVE_CSS}${ALIVE[glyph]}</style>` : `<style>${motion}${HOVER_CSS}${HOVER[glyph]}</style>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="100%" height="100%" style="--t:${t}">${style}<defs>${drawing.defs}</defs>${cap}<g transform="translate(21.5 5) scale(.84)"><g class="hv">${drawing.body}</g></g></svg>`
}

// Glow of a placed reaction in a row button, the colour of its picture.
export const GLOW: Record<Glyph, string> = { pinch: '255,190,60', heart: '255,79,126', target: '240,56,75', fire: '255,154,31', poop: '160,130,90', robot: '110,200,255' }

// The room around a drawing in a row button or a chip: 6 units of 64, so the icon fills the same box a seventh more
// than with 10, and its animations (the hover bounce, the kiss) still fit.
const FRAME = '-6 -6 76 76'

// In the row: idle, no reactions, all three at full strength; on, this one is placed; off, another one is.
export type ButtonState = 'idle' | 'on' | 'off'

// The picture under the transparent row button: a static drawing, no capsule or rim. The app's button draws
// its own frame under the cursor, so two shapes have nothing to argue about. A placed one glows with a soft spot;
// unplaced ones lose colour, not just opacity: on a dark theme opacity alone looks muddy.
// A plaque behind the icon under the cursor, on the whole box the picture is drawn in (w × h px). The app's own
// button frame there is 2 px narrower and 20 px tall, of about the same tone (measured on screenshots: 17 of 255
// over the dark background, 13 under the white), so the plaque is a ring around it, not a second layer: together they
// read as one frame, 8 px taller. The tone follows the theme the picture is shown in; where that is unknown, the dark one. The viewBox is square and fits the box's height; the box's extra width is room on both sides.
function plaque([w, h]: readonly [number, number]): string {
  const u = 76 / h
  const rect = (pw: number, ph: number, pr: number) => {
    const [rw, rh, r] = [pw * u, ph * u, pr * u]
    const [x, y] = [32 - rw / 2, 32 - rh / 2]
    const n = (v: number) => v.toFixed(1)
    return `M${n(x + r)} ${n(y)}H${n(x + rw - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + rw)} ${n(y + r)}V${n(y + rh - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + rw - r)} ${n(y + rh)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + rh - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  }
  const tone = '<style>.pl{fill:rgba(128,128,128,.165)}@media (prefers-color-scheme: light){.pl{fill:rgba(0,0,0,.051)}}</style>'
  return `${tone}<path class="pl" d="${rect(w, h, 7)}${rect(w - 2, 20, 5)}" fill-rule="evenodd" fill="rgba(128,128,128,.165)"/>`
}

// box: the hover copy of the button, with the plaque behind it, for a box of that size.
export function buttonSvg(pack: Pack, glyph: Glyph, state: ButtonState, box?: readonly [number, number]): string {
  const drawing = drawingOf(pack, glyph, false)
  if (!drawing) return ''
  const rgb = GLOW[glyph]
  const extra =
    state === 'on'
      ? `<radialGradient id="rxglow"><stop offset="0" stop-color="rgb(${rgb})" stop-opacity=".5"/><stop offset=".6" stop-color="rgb(${rgb})" stop-opacity=".16"/><stop offset="1" stop-color="rgb(${rgb})" stop-opacity="0"/></radialGradient>`
      : state === 'off'
        ? '<filter id="rxmute"><feColorMatrix type="saturate" values=".25"/></filter>'
        : ''
  // A placed one glows, except under the cursor: there the plaque and the app's frame are its background.
  const spot = state === 'on' && !box ? '<circle cx="32" cy="34" r="42" fill="url(#rxglow)"/>' : ''
  const mute = state === 'off' ? ' filter="url(#rxmute)" opacity=".6"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FRAME}" width="100%" height="100%"><defs>${drawing.defs}${extra}</defs>${box ? plaque(box) : ''}${spot}<g${mute}>${drawing.body}</g></svg>`
}

// A placed reaction under an answer: the icon without a capsule. A transparent native button lies on top
// (a click removes the reaction); its frame under the cursor is the icon's frame, so two shapes have nothing to argue about.
// A soft glow, like the lit button in the row. elapsed is the appear animation; alive is the live copy under the cursor.
export function chipSvg(pack: Pack, glyph: Glyph, options: { elapsed?: number; alive?: boolean; box?: readonly [number, number] } = {}): string {
  const drawing = drawingOf(pack, glyph, true)
  if (!drawing) return ''
  const elapsed = options.elapsed !== undefined && Number.isFinite(options.elapsed) ? Math.max(0, options.elapsed) : SETTLED_MS
  const t = `${(Math.min(elapsed, SETTLED_MS) / 1000).toFixed(2)}s`
  const rgb = GLOW[glyph]
  const glow = `<radialGradient id="rxglow"><stop offset="0" stop-color="rgb(${rgb})" stop-opacity=".5"/><stop offset=".6" stop-color="rgb(${rgb})" stop-opacity=".16"/><stop offset="1" stop-color="rgb(${rgb})" stop-opacity="0"/></radialGradient>`
  const style = `<style>${shifted(drawing.css)}${options.alive ? ALIVE_CSS + ALIVE[glyph] : ''}</style>`
  // Under the cursor the plaque and the app's frame are the background, one flat tone: no glow inside them.
  const back = options.box ? plaque(options.box) : '<circle cx="32" cy="34" r="42" fill="url(#rxglow)"/>'
  return `<svg class="chip" xmlns="http://www.w3.org/2000/svg" viewBox="${FRAME}" width="100%" height="100%" style="--t:${t}">${style}<defs>${drawing.defs}${glow}</defs>${back}<g class="hv">${drawing.body}</g></svg>`
}
