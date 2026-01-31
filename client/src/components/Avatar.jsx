/**
 * Avatar Component (V1.2)
 * 
 * Renders deterministic SVG avatars using DiceBear's "bottts" style.
 * 
 * FEATURES:
 * - Deterministic: Same seed always produces same avatar
 * - Lightweight: SVG rendered directly in React (no external image requests)
 * - Responsive: Size adapts based on props
 * - Styleable: Supports className for custom styling
 * 
 * USAGE:
 *   <Avatar seed={player.id || player.name} size={40} />
 *   <Avatar seed={player.id} speaking />
 *   <Avatar seed={player.id} disconnected />
 */

import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

export default function Avatar({ 
    seed, 
    size = 40, 
    className = '',
    speaking = false,      // Adds glow/pulse effect for active speaker
    disconnected = false,  // Grayscale filter for disconnected players
    highlighted = false    // Special highlight (e.g., imposter reveal)
}) {
    // Generate SVG avatar using DiceBear
    // useMemo ensures we don't regenerate on every render
    const avatarSvg = useMemo(() => {
        const avatar = createAvatar(bottts, {
            seed: seed || 'default',
            size: size,
            // Bottts-specific options for variety
            backgroundColor: ['transparent'],
        });
        return avatar.toString();
    }, [seed, size]);

    // Build className based on state
    const containerClasses = [
        'avatar',
        className,
        speaking ? 'avatar-speaking' : '',
        disconnected ? 'avatar-disconnected' : '',
        highlighted ? 'avatar-highlighted' : ''
    ].filter(Boolean).join(' ');

    return (
        <div 
            className={containerClasses}
            style={{ 
                width: size, 
                height: size,
                minWidth: size,  // Prevent shrinking in flex containers
                minHeight: size
            }}
            dangerouslySetInnerHTML={{ __html: avatarSvg }}
            aria-label="Player avatar"
        />
    );
}
