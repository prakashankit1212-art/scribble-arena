import type {ButtonHTMLAttributes,ReactNode} from 'react';
export function Button({children,variant='soft',className='',...p}:{children:ReactNode;variant?:'primary'|'soft'|'ghost'}&ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`btn btn-${variant} ${className}`} {...p}>{children}</button>}
