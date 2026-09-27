import UserCard from '@layouts/cards/UserCard'
import ListWrapper from './ListWrapper'
import useUiDensity from '@helpers/useUiDensity'

const UsersList = ({ users }) => {
  const { isCompact } = useUiDensity()
  const itemSize = isCompact ? 270 : 278
  return (
    <ListWrapper
      itemCount={users.length}
      itemSize={itemSize}
      className="bg-gray-50"
    >
      {({ index, style }) => (
        <UserCard
          style={style}
          key={users[index]._id}
          userId={users[index]._id}
          user={users[index]}
        />
      )}
    </ListWrapper>
  )
}

export default UsersList
